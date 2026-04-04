import type { DocumentPayload, UIMessage } from '@figjambo/shared';
import { DEFAULT_PROJECT_NAME } from '@figjambo/shared';
import { extractAllNodes } from './extractor';

figma.showUI(__html__, { width: 360, height: 240, themeColors: true });

figma.ui.onmessage = async (msg: UIMessage) => {
  if (msg.type === 'start-extract') {
    try {
      const page = figma.currentPage;

      // Phase 1: Extract all nodes
      const { nodes, imageHashes } = await extractAllNodes(page, (current, total) => {
        figma.ui.postMessage({ type: 'extract-progress', current, total });
      });

      const payload: DocumentPayload = {
        userName: figma.currentUser?.name || 'unknown',
        projectName: DEFAULT_PROJECT_NAME,
        documentName: figma.root.name,
        pageName: page.name,
        extractedAt: new Date().toISOString(),
        nodeCount: nodes.length,
        imageCount: imageHashes.size,
        nodes,
        fileKey: figma.fileKey,
      };

      figma.ui.postMessage({ type: 'nodes-complete', payload });

      // Phase 2: Extract images
      let imagesSent = 0;
      for (const hash of imageHashes) {
        const image = figma.getImageByHash(hash);
        if (!image) continue;

        try {
          const bytes = await image.getBytesAsync();
          const size = await image.getSizeAsync();
          figma.ui.postMessage({
            type: 'image',
            hash,
            bytes,
            filename: `${hash}.png`,
            width: size.width,
            height: size.height,
          });
          imagesSent++;
        } catch (e) {
          console.error(`Failed to extract image ${hash}:`, e);
        }
      }

      figma.ui.postMessage({ type: 'images-complete', count: imagesSent });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      figma.ui.postMessage({ type: 'extract-error', error });
    }
  }
};
