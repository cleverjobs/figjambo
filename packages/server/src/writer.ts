import fs from 'fs';
import path from 'path';
import { config } from './config.js';

export function sanitizeDirName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

export function writeMarkdown(content: string, documentName: string): string {
  const dirName = sanitizeDirName(documentName);
  const outputPath = path.join(config.outputDir, dirName);

  fs.mkdirSync(outputPath, { recursive: true });
  fs.mkdirSync(path.join(outputPath, 'assets'), { recursive: true });

  const filepath = path.join(outputPath, 'README.md');
  fs.writeFileSync(filepath, content, 'utf-8');

  return filepath;
}

export function writeImage(
  buffer: Buffer,
  documentName: string,
  imageHash: string,
  ext: string
): { filepath: string; skipped: boolean } {
  const dirName = sanitizeDirName(documentName);
  const assetsDir = path.join(config.outputDir, dirName, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  const filepath = path.join(assetsDir, `${imageHash}${ext}`);

  if (fs.existsSync(filepath)) {
    return { filepath, skipped: true };
  }

  fs.writeFileSync(filepath, buffer);
  return { filepath, skipped: false };
}
