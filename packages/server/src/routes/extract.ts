import type { FastifyInstance } from 'fastify';
import type { DocumentPayload } from '@figjambo/shared';
import { convertToMarkdown } from '../converter.js';
import { writeMarkdown } from '../writer.js';

export async function extractRoute(server: FastifyInstance) {
  server.post<{ Body: DocumentPayload }>('/extract', async (request) => {
    const payload = request.body;
    const markdown = convertToMarkdown(payload);
    const filepath = writeMarkdown(markdown, payload.documentName);

    return {
      status: 'success',
      filepath,
      nodeCount: payload.nodeCount,
    };
  });
}
