import { config } from './config.js';

const FIGMA_API_BASE = 'https://api.figma.com';

// fileKey → folder name
const folderNameCache = new Map<string, string>();

interface Logger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown> | string, msg?: string) => void;
}

export async function fetchFolderName(fileKey: string, userName: string, logger: Logger): Promise<string | null> {
  const cached = folderNameCache.get(fileKey);
  if (cached !== undefined) {
    logger.info({ fileKey, cached: true }, 'Folder name from cache');
    return cached;
  }

  const token = config.figmaAccessTokens.get(userName);
  if (!token) {
    logger.warn({ userName }, `No Figma token configured for user "${userName}"`);
    return null;
  }

  try {
    const res = await fetch(`${FIGMA_API_BASE}/v1/files/${fileKey}/meta`, {
      headers: { 'X-Figma-Token': token },
    });

    if (!res.ok) {
      logger.warn({ status: res.status, fileKey, userName }, 'Figma API error — falling back to default');
      return null;
    }

    const data = (await res.json()) as { file?: { folder_name?: string } };
    const folderName = data.file?.folder_name || null;

    if (folderName) {
      folderNameCache.set(fileKey, folderName);
      logger.info({ fileKey, folderName, userName }, 'Resolved folder name from Figma API');
    }

    return folderName;
  } catch (err) {
    logger.warn({ err: String(err), fileKey }, 'Figma API request failed — falling back to default');
    return null;
  }
}
