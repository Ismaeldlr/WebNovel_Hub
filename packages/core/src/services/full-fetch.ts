import { EPUB_SOURCE, type ExportListResponse, type FullFetchResponse } from '@webnovel-hub/shared';
import type { Database } from '../db/database.js';
import { AppError } from '../errors.js';
import {
  cancelFullFetch,
  countStoredChapters,
  enqueueFullFetch,
  findLatestFullFetch,
  listRequestedFullFetches,
} from '../repositories/full-fetch.js';
import { findNovelSource } from '../repositories/novels.js';
import { CATALOG_MESSAGES } from './catalog.js';

export const FULL_FETCH_MESSAGES = {
  epub: 'EPUB novels have every chapter stored already.',
  allStored: 'Every chapter of this novel is stored already.',
  noneActive: "This novel isn't being fetched.",
} as const;

export interface FullFetchService {
  /** The novel's latest whole-novel fetch and its stored chapters (404 for an unknown novel). */
  get(novelId: string): Promise<FullFetchResponse>;
  /**
   * Queues a fetch of every chapter not stored yet: 409 for an EPUB import or a novel
   * with every chapter stored. If one is already waiting or running, that one is
   * returned instead of a second one.
   */
  start(novelId: string): Promise<FullFetchResponse>;
  /** Stops the novel's fetch; 409 when none is active. */
  cancel(novelId: string): Promise<FullFetchResponse>;
  /** The novels asked to be fetched in full, to export them (the Exports page). */
  list(): Promise<ExportListResponse>;
}

/** "Fetch all chapters": queued here; the job runner paces the fetching per site. */
export function createFullFetchService(
  db: Database,
  options: { maxRetries: number },
): FullFetchService {
  async function requireSource(novelId: string): Promise<string> {
    const source = await findNovelSource(db, novelId);
    if (source === null) throw new AppError(404, CATALOG_MESSAGES.novelNotFound);
    return source;
  }

  async function describe(novelId: string): Promise<FullFetchResponse> {
    const [fetch, chapters] = await Promise.all([
      findLatestFullFetch(db, novelId),
      countStoredChapters(db, novelId),
    ]);
    return { fetch, storedChapters: chapters.stored, totalChapters: chapters.total };
  }

  return {
    async get(novelId) {
      await requireSource(novelId);
      return describe(novelId);
    },

    async start(novelId) {
      const source = await requireSource(novelId);
      if (source === EPUB_SOURCE) throw new AppError(409, FULL_FETCH_MESSAGES.epub);
      const before = await describe(novelId);
      const active = before.fetch?.status === 'pending' || before.fetch?.status === 'running';
      if (!active && before.storedChapters >= before.totalChapters) {
        throw new AppError(409, FULL_FETCH_MESSAGES.allStored);
      }
      await enqueueFullFetch(db, { novelId, source, maxRetries: options.maxRetries });
      return describe(novelId);
    },

    async cancel(novelId) {
      await requireSource(novelId);
      if ((await cancelFullFetch(db, novelId)) === 'none') {
        throw new AppError(409, FULL_FETCH_MESSAGES.noneActive);
      }
      return describe(novelId);
    },

    async list() {
      return { items: await listRequestedFullFetches(db) };
    },
  };
}
