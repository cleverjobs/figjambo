import type { DocumentPayload, PluginMessage, ExtractResponse } from '@figjambo/shared';

const extractBtn = document.getElementById('extractBtn') as HTMLButtonElement;
const progressFill = document.getElementById('progressFill') as HTMLDivElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const nodeCountEl = document.getElementById('nodeCount') as HTMLSpanElement;
const imageCountEl = document.getElementById('imageCount') as HTMLSpanElement;

const serverUrl = 'http://localhost:8000';

extractBtn.addEventListener('click', async () => {
  extractBtn.disabled = true;
  setStatus('Checking server...', '');

  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 3000);
    await fetch(`${serverUrl}/health`, { signal: controller.signal });
  } catch {
    setStatus('Server not running. Start it with: npm run dev:server', 'error');
    extractBtn.disabled = false;
    return;
  }

  setStatus('Extracting...', '');
  setProgress(0);
  parent.postMessage({ pluginMessage: { type: 'start-extract' } }, '*');
});

function setStatus(text: string, className: string) {
  statusEl.textContent = text;
  statusEl.className = `status ${className}`;
}

function setProgress(pct: number) {
  progressFill.style.width = `${Math.min(100, pct)}%`;
}

async function sendPayload(payload: DocumentPayload): Promise<ExtractResponse> {
  const res = await fetch(`${serverUrl}/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Server error: ${res.status}`);
  return res.json();
}

async function sendImage(
  hash: string,
  bytes: Uint8Array,
  filename: string,
  width: number,
  height: number
): Promise<void> {
  const blob = new Blob([bytes], { type: 'image/png' });
  const formData = new FormData();
  // String fields BEFORE file — ensures @fastify/multipart parses them reliably
  formData.append('imageHash', hash);
  formData.append('userName', currentPayloadContext.userName);
  formData.append('teamName', currentPayloadContext.teamName);
  formData.append('projectName', currentPayloadContext.projectName);
  formData.append('documentName', currentPayloadContext.documentName);
  formData.append('fileKey', currentPayloadContext.fileKey);
  formData.append('pageName', currentPayloadContext.pageName);
  formData.append('originalWidth', String(width));
  formData.append('originalHeight', String(height));
  formData.append('file', new File([blob], filename, { type: 'image/png' }));

  const res = await fetch(`${serverUrl}/upload-image`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error(`Image upload failed: ${res.status}`);
}

let currentPayloadContext = { userName: '', teamName: '', projectName: '', documentName: '', fileKey: '', pageName: '' };
let totalImageCount = 0;

// Promise that resolves when the /extract response arrives (so images use the resolved projectName)
let extractReady: Promise<void> = Promise.resolve();
let resolveExtractReady: () => void = () => {};

// Queue images and send sequentially after all arrive
interface QueuedImage {
  hash: string;
  bytes: Uint8Array;
  filename: string;
  width: number;
  height: number;
}
const imageQueue: QueuedImage[] = [];

async function flushImageQueue() {
  const total = imageQueue.length;
  let sent = 0;
  let failed = 0;

  for (const img of imageQueue) {
    try {
      await sendImage(
        img.hash, img.bytes, img.filename,
        img.width, img.height
      );
      sent++;
    } catch (e) {
      failed++;
      console.error(`Failed to upload image ${img.hash}:`, e);
    }
    // Progress: 80-100% range for uploads
    const pct = 80 + ((sent + failed) / total) * 20;
    setProgress(pct);
    setStatus(`Uploading images: ${sent + failed}/${total}`, '');
  }

  imageQueue.length = 0;
  return { sent, failed };
}

window.onmessage = async (event: MessageEvent) => {
  const msg = event.data.pluginMessage as PluginMessage;
  if (!msg) return;

  switch (msg.type) {
    case 'extract-progress': {
      const pct = (msg.current / msg.total) * 50;
      setProgress(pct);
      setStatus(`Extracting nodes: ${msg.current}/${msg.total}`, '');
      break;
    }

    case 'nodes-complete': {
      nodeCountEl.textContent = String(msg.payload.nodeCount);
      imageCountEl.textContent = String(msg.payload.imageCount);
      totalImageCount = msg.payload.imageCount;
      currentPayloadContext = {
        userName: msg.payload.userName,
        teamName: '',
        projectName: msg.payload.projectName,
        documentName: msg.payload.documentName,
        fileKey: msg.payload.fileKey || '',
        pageName: msg.payload.pageName,
      };

      setStatus('Sending to server...', '');
      setProgress(50);

      // Gate image uploads until extract response arrives with resolved projectName
      extractReady = new Promise<void>(r => { resolveExtractReady = r; });

      try {
        const result = await sendPayload(msg.payload);
        if (result.status === 'success') {
          if (result.teamName) {
            currentPayloadContext.teamName = result.teamName;
          }
          if (result.projectName) {
            currentPayloadContext.projectName = result.projectName;
          }
          resolveExtractReady();
          if (msg.payload.imageCount === 0) {
            setProgress(100);
            setStatus(`Done! ${msg.payload.nodeCount} nodes, 0 images.`, 'success');
            extractBtn.disabled = false;
            break;
          }
          setStatus(`Markdown saved. Waiting for images...`, '');
          setProgress(55);
        } else {
          throw new Error(result.error || 'Unknown server error');
        }
      } catch (e) {
        resolveExtractReady();
        const errMsg = e instanceof Error ? e.message : String(e);
        setStatus(`Server error: ${errMsg}`, 'error');
        extractBtn.disabled = false;
      }
      break;
    }

    case 'image': {
      imageQueue.push({
        hash: msg.hash,
        bytes: msg.bytes,
        filename: msg.filename,
        width: msg.width,
        height: msg.height,
      });
      // Progress: 55-80% range for image extraction
      if (totalImageCount > 0) {
        const pct = 55 + (imageQueue.length / totalImageCount) * 25;
        setProgress(pct);
        setStatus(`Extracting images: ${imageQueue.length}/${totalImageCount}`, '');
      }
      break;
    }

    case 'images-complete': {
      // Wait for extract response (resolves projectName) before uploading images
      await extractReady;
      setStatus(`Uploading ${imageQueue.length} images...`, '');
      setProgress(80);

      const { sent, failed } = await flushImageQueue();

      setProgress(100);
      const failNote = failed > 0 ? ` (${failed} failed)` : '';
      setStatus(
        `Done! ${nodeCountEl.textContent} nodes, ${sent} images${failNote}.`,
        failed > 0 ? '' : 'success'
      );
      extractBtn.disabled = false;
      break;
    }

    case 'extract-error': {
      setStatus(`Error: ${msg.error}`, 'error');
      extractBtn.disabled = false;
      break;
    }
  }
};
