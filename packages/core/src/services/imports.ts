import type { ImportConflict, ImportUrlResponse, IngestionJob } from '@webnovel-hub/shared';
import type { Queryable } from '../db/database.js';
import { AppError } from '../errors.js';
import { enqueueIngestion, listRecentImports } from '../repositories/jobs.js';
import { findNovelBySourceUrl } from '../repositories/novels.js';
import { findImportableSource, importableSourceNames } from '../repositories/sources.js';

export const IMPORT_MESSAGES = {
  malformed: "That doesn't look like a web address. Paste the novel's full URL.",
  duplicate: 'This novel is already in your library.',
} as const;

export interface ImportService {
  /**
   * Validates the address and queues a `novel_ingestion` job. Throws a 400 for a
   * malformed URL or an unsupported site and a 409 (with an `ImportConflict`) for a URL
   * already stored. An active import of the same URL is reused.
   */
  importUrl(url: string): Promise<ImportUrlResponse>;
  recentImports(limit: number): Promise<IngestionJob[]>;
}

/** An absolute http(s) URL with a host and no embedded credentials, or null. */
function parseWebAddress(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const web = url.protocol === 'http:' || url.protocol === 'https:';
  return web && url.hostname !== '' && url.username === '' && url.password === '' ? url : null;
}

/**
 * Only the host is matched against `source_sites` here. Which page of a site is a novel,
 * and which novel it is, the scraper decides: an address that isn't a novel page fails
 * the job with a clear message, and another address of a stored novel completes it as a
 * duplicate.
 */
export function createImportService(db: Queryable, options: { maxRetries: number }): ImportService {
  return {
    async importUrl(value) {
      const url = value.trim();
      const address = parseWebAddress(url);
      if (!address) throw new AppError(400, IMPORT_MESSAGES.malformed);

      // WHATWG URL parsing lower-cases the host already.
      const source = await findImportableSource(db, address.hostname);
      if (!source) {
        const names = await importableSourceNames(db);
        const supported = names.length > 0 ? ` Supported sites: ${names.join(', ')}.` : '';
        throw new AppError(400, `This site isn't supported.${supported}`);
      }

      const existing = await findNovelBySourceUrl(db, url);
      if (existing) {
        const data: ImportConflict = existing;
        throw new AppError(409, IMPORT_MESSAGES.duplicate, { data });
      }

      const job = await enqueueIngestion(db, {
        url,
        source: source.key,
        maxRetries: options.maxRetries,
      });
      return { jobId: job.id };
    },

    recentImports: (limit) => listRecentImports(db, limit),
  };
}
