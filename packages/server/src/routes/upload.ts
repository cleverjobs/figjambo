import type { FastifyInstance } from 'fastify';
import path from 'path';
import { writeImage } from '../writer.js';

export async function uploadRoute(server: FastifyInstance) {
  server.post('/upload-image', async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ status: 'error', error: 'No file provided' });
    }

    const imageHash = (data.fields.imageHash as any)?.value as string;
    const documentName = (data.fields.documentName as any)?.value as string;

    if (!imageHash || !documentName) {
      return reply.code(400).send({ status: 'error', error: 'Missing imageHash or documentName' });
    }

    const ext = path.extname(data.filename) || '.png';
    const buffer = await data.toBuffer();
    const { filepath, skipped } = writeImage(buffer, documentName, imageHash, ext);

    return { status: 'success', filepath, skipped };
  });
}
