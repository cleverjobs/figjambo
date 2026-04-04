import type { DocumentPayload, PluginMessage, ExtractResponse } from '@figjambo/shared';

const serverUrlInput = document.getElementById('serverUrl') as HTMLInputElement;
const extractBtn = document.getElementById('extractBtn') as HTMLButtonElement;
const progressFill = document.getElementById('progressFill') as HTMLDivElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const nodeCountEl = document.getElementById('nodeCount') as HTMLSpanElement;
const imageCountEl = document.getElementById('imageCount') as HTMLSpanElement;

let serverUrl = serverUrlInput.value;

serverUrlInput.addEventListener('input', () => {
  serverUrl = serverUrlInput.value.replace(/\/+$/, '');
});

extractBtn.addEventListener('click', () => {
  extractBtn.disabled = true;
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
  documentName: string,
  width: number,
  height: number
): Promise<void> {
  const blob = new Blob([bytes], { type: 'image/png' });
  const formData = new FormData();
  formData.append('file', new File([blob], filename, { type: 'image/png' }));
  formData.append('imageHash', hash);
  formData.append('documentName', documentName);
  formData.append('originalWidth', String(width));
  formData.append('originalHeight', String(height));

  const res = await fetch(`${serverUrl}/upload-image`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error(`Image upload failed: ${res.status}`);
}

let currentDocumentName = '';

window.onmessage = async (event: MessageEvent) => {
  const msg = event.data.pluginMessage as PluginMessage;
  if (!msg) return;

  switch (msg.type) {
    case 'extract-progress': {
      const pct = (msg.current / msg.total) * 50; // First 50% is extraction
      setProgress(pct);
      setStatus(`Extracting nodes: ${msg.current}/${msg.total}`, '');
      break;
    }

    case 'nodes-complete': {
      nodeCountEl.textContent = String(msg.payload.nodeCount);
      imageCountEl.textContent = String(msg.payload.imageCount);
      currentDocumentName = msg.payload.documentName;

      setStatus('Sending to server...', '');
      setProgress(50);

      try {
        const result = await sendPayload(msg.payload);
        if (result.status === 'success') {
          setStatus(`Markdown saved. Uploading images...`, '');
          setProgress(60);
        } else {
          throw new Error(result.error || 'Unknown server error');
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        setStatus(`Server error: ${errMsg}`, 'error');
        extractBtn.disabled = false;
      }
      break;
    }

    case 'image': {
      try {
        await sendImage(
          msg.hash, msg.bytes, msg.filename,
          currentDocumentName, msg.width, msg.height
        );
      } catch (e) {
        console.error(`Failed to upload image ${msg.hash}:`, e);
      }
      break;
    }

    case 'images-complete': {
      setProgress(100);
      setStatus(
        `Done! Extracted ${nodeCountEl.textContent} nodes, ${msg.count} images.`,
        'success'
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
