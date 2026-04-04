import fs from 'fs';
import path from 'path';
import { config } from './config.js';

export function sanitizeDirName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'unnamed';
}

// .output/<user>/<project>/<filename>/<pagename>/
function getPageDir(userName: string, projectName: string, documentName: string, pageName: string): string {
  return path.join(
    config.outputDir,
    sanitizeDirName(userName),
    sanitizeDirName(projectName),
    sanitizeDirName(documentName),
    sanitizeDirName(pageName),
  );
}

export function writeMarkdown(
  content: string,
  userName: string,
  projectName: string,
  documentName: string,
  pageName: string,
): string {
  const outputPath = getPageDir(userName, projectName, documentName, pageName);
  const assetsDir = path.join(outputPath, 'assets');

  // Idempotent: clean previous extraction
  if (fs.existsSync(assetsDir)) {
    fs.rmSync(assetsDir, { recursive: true });
  }

  fs.mkdirSync(outputPath, { recursive: true });
  fs.mkdirSync(assetsDir, { recursive: true });

  const filepath = path.join(outputPath, 'content.md');
  fs.writeFileSync(filepath, content, 'utf-8');

  return filepath;
}

export function writeImage(
  buffer: Buffer,
  userName: string,
  projectName: string,
  documentName: string,
  pageName: string,
  imageHash: string,
  ext: string,
): { filepath: string; skipped: boolean } {
  const assetsDir = path.join(getPageDir(userName, projectName, documentName, pageName), 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  const filepath = path.join(assetsDir, `${imageHash}${ext}`);

  if (fs.existsSync(filepath)) {
    return { filepath, skipped: true };
  }

  fs.writeFileSync(filepath, buffer);
  return { filepath, skipped: false };
}
