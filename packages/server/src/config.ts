import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_PORT, DEFAULT_HOST } from '@figjambo/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.FIGJAMBO_PORT ?? DEFAULT_PORT),
  host: process.env.FIGJAMBO_HOST ?? DEFAULT_HOST,
  outputDir: process.env.FIGJAMBO_OUTPUT_DIR ?? path.resolve(__dirname, '../../../output'),
};
