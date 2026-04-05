import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { extractRoute } from './routes/extract.js';
import { uploadRoute } from './routes/upload.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.resolve(__dirname, '../../../.logs');
fs.mkdirSync(logsDir, { recursive: true });

// Sofia time (Europe/Sofia), compact format: YYYYMMDDHHmmss
const now = new Date();
const sofia = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Sofia',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
}).format(now).replace(/[-: ]/g, '');
const pid = process.pid;
const logFile = path.join(logsDir, `server-${sofia}-${pid}.log`);

const server = Fastify({
  logger: {
    level: 'info',
    transport: {
      targets: [
        { target: 'pino-pretty', options: { destination: 1 } },
        { target: 'pino/file', options: { destination: logFile } },
      ],
    },
  },
});

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

const teamCount = config.topology.teams.length;
const projectCount = config.topology.teams.reduce((n, t) => n + t.projects.length, 0);
const fileCount = config.topology.teams.reduce(
  (n, t) => n + t.projects.reduce((m, p) => m + p.files.length, 0), 0,
);
server.log.info(
  `Topology loaded: ${teamCount} teams, ${projectCount} projects, ${fileCount} files (updated ${config.topology.updatedAt})`,
);
