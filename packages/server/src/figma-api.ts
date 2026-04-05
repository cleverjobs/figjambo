import { config, type FileLookup } from './config.js';

const DEFAULT_LOOKUP: FileLookup = { teamName: 'default', projectName: 'default' };

interface Logger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown> | string, msg?: string) => void;
}

export function lookupFile(fileKey: string | undefined, logger: Logger): FileLookup {
  if (!fileKey) {
    logger.warn('No fileKey provided — using defaults');
    return DEFAULT_LOOKUP;
  }

  const result = config.fileKeyLookup.get(fileKey);
  if (result) {
    logger.info({ fileKey, ...result }, 'Resolved file from topology');
    return result;
  }

  logger.warn({ fileKey }, 'File key not in topology — using defaults. Run: npm run update-teams');
  return DEFAULT_LOOKUP;
}
