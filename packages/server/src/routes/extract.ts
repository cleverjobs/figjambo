import type { FastifyInstance } from 'fastify';
import type { DocumentPayload } from '@figjambo/shared';
import { convertToMarkdown } from '../converter.js';
import { writeMarkdown } from '../writer.js';
import { fetchFolderName } from '../figma-api.js';

export async function extractRoute(server: FastifyInstance) {
  server.post<{ Body: DocumentPayload }>('/extract', async (request) => {
    const payload = request.body;

    let projectName = payload.projectName;
    if (payload.fileKey) {
      const folderName = await fetchFolderName(payload.fileKey, payload.userName, request.log);
      if (folderName) {
        projectName = folderName;
      }
    }

    const markdown = convertToMarkdown(payload);
    const filepath = writeMarkdown(
      markdown,
      payload.userName,
      projectName,
      payload.documentName,
      payload.pageName,
    );

    return {
      status: 'success',
      filepath,
      nodeCount: payload.nodeCount,
      projectName,
    };
  });
}
