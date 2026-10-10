import { MAX_COVER_BYTES, coverMediaType, imageType } from '../lib/images.js';
import type { Logger } from '../logger.js';
import type { Cover } from '../repositories/covers.js';
import { ScrapeError } from './errors.js';
import type { SourceSession } from './session.js';

const ACCEPTED_CONTENT_TYPES = ['image/', 'application/octet-stream', 'binary/octet-stream'];

/**
 * A novel's cover from its site, or null. A cover that can't be downloaded or isn't a
 * real image never fails an import: the novel is stored without one.
 */
export async function downloadCover(
  session: SourceSession,
  url: string,
  logger: Logger,
): Promise<Cover | null> {
  let download;
  try {
    download = await session.getBytes(url, MAX_COVER_BYTES);
  } catch (error) {
    if (!(error instanceof ScrapeError)) throw error;
    logger.warn({ url, error: error.detail }, 'cover not downloaded');
    return null;
  }
  const contentType = (download.contentType ?? '').split(';')[0]!.trim().toLowerCase();
  const type = imageType(download.data);
  if (
    !type ||
    (contentType && !ACCEPTED_CONTENT_TYPES.some((accepted) => contentType.startsWith(accepted)))
  ) {
    logger.warn({ url, contentType: contentType || 'none' }, 'cover is not a supported image');
    return null;
  }
  return { mediaType: coverMediaType(type), bytes: download.data };
}
