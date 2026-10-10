import { getPlatform } from '../platform';

/** How long a saved file's object URL is kept; the browser has its bytes well before. */
const REVOKE_AFTER_MS = 60_000;

/**
 * Saves a file: where the reader picks in the app, or as a browser download. Resolves to
 * false when the reader cancels.
 */
export async function saveFile(file: Blob, fileName: string): Promise<boolean> {
  const platform = await getPlatform();
  if (platform.saveFile) return platform.saveFile(file, fileName);

  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
  return true;
}
