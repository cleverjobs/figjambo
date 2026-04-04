import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_PORT, DEFAULT_HOST } from '@figjambo/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Parses "user1:token1,user2:token2" into a Map<userName, token> */
function parseFigmaTokens(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const name = trimmed.slice(0, colonIdx).trim();
    const token = trimmed.slice(colonIdx + 1).trim();
    if (name && token) map.set(name, token);
  }
  return map;
}

export const config = {
  port: Number(process.env.FIGJAMBO_PORT ?? DEFAULT_PORT),
  host: process.env.FIGJAMBO_HOST ?? DEFAULT_HOST,
  outputDir: process.env.FIGJAMBO_OUTPUT_DIR ?? path.resolve(__dirname, '../../../.output'),
  figmaAccessTokens: parseFigmaTokens(process.env.FIGMA_ACCESS_TOKENS ?? ''),
};
