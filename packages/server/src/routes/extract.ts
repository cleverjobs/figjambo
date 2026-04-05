import type { FastifyInstance } from 'fastify';
import type { DocumentPayload } from '@figjambo/shared';
import { convertToMarkdown } from '../converter.js';
import { writeMarkdown } from '../writer.js';
import { lookupFile } from '../figma-api.js';

export async function extractRoute(server: FastifyInstance) {
  server.post<{ Body: DocumentPayload }>('/extract', async (request) => {
    const payload = request.body;

    const { teamName, projectName } = lookupFile(payload.fileKey, request.log);

    const markdown = convertToMarkdown(payload);
    const filepath = writeMarkdown(
      markdown,
      payload.userName,
      teamName,
      projectName,
      payload.documentName,
      payload.fileKey,
      payload.pageName,
    );

    return {
      status: 'success',
      filepath,
      nodeCount: payload.nodeCount,
      teamName,
      projectName,
    };
  });
}
