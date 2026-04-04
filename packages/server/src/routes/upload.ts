import type { FastifyInstance } from 'fastify';
import type { MultipartFile, MultipartValue } from '@fastify/multipart';
import path from 'path';
import { writeImage } from '../writer.js';

export async function uploadRoute(server: FastifyInstance) {
  server.post('/upload-image', async (request, reply) => {
    const parts = request.parts();
    const fields: Record<string, string> = {};
    let fileBuffer: Buffer | null = null;
    let filename = '';

    for await (const part of parts) {
      if (part.type === 'file') {
        fileBuffer = await (part as MultipartFile).toBuffer();
        filename = (part as MultipartFile).filename;
      } else {
        fields[(part as MultipartValue).fieldname] = (part as MultipartValue).value as string;
      }
    }

    if (!fileBuffer) {
      return reply.code(400).send({ status: 'error', error: 'No file provided' });
    }

    const { imageHash, userName, projectName, documentName, pageName } = fields;

    if (!imageHash || !documentName) {
      request.log.error({ receivedFields: Object.keys(fields) }, 'Missing required fields');
      return reply.code(400).send({
        status: 'error',
        error: `Missing fields. Got: ${Object.keys(fields).join(', ')}`,
      });
    }

    const ext = path.extname(filename) || '.png';
    const { filepath, skipped } = writeImage(
      fileBuffer,
      userName || 'unknown',
      projectName || 'default',
      documentName,
      pageName || 'default',
      imageHash,
      ext,
    );

    request.log.info({ imageHash, filepath, skipped }, 'Image saved');
    return { status: 'success', filepath, skipped };
  });
}
