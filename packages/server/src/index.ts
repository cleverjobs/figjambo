import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { config } from './config.js';
import { extractRoute } from './routes/extract.js';
import { uploadRoute } from './routes/upload.js';

const server = Fastify({ logger: true });

await server.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
});

await server.register(multipart, {
  limits: { fileSize: 50 * 1024 * 1024 },
});

server.get('/health', async () => ({ status: 'ok' }));

await server.register(extractRoute);
await server.register(uploadRoute);

await server.listen({ port: config.port, host: config.host });
