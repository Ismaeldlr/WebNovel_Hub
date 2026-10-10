import { EPUB_SOURCE, type UpdateRun, type UpdateRunPage } from '@webnovel-hub/shared';
import type { Database } from '../db/database.js';
import { AppError } from '../errors.js';
import { findNovelSource } from '../repositories/novels.js';
import {
  enqueueManualUpdateCheck,
  findLatestManualRun,
  findUpdateRun,
  listUpdateRuns,
} from '../repositories/updates.js';
import { CATALOG_MESSAGES } from './catalog.js';

export const UPDATE_MESSAGES = {
  epub: 'EPUB novels have no source site to check for new chapters.',
} as const;

export interface UpdateService {
  /**
   * Queues a manual check of the novel for new chapters: 404 for an unknown novel, 409
   * for an EPUB import. If the novel's check is already waiting or running, that one is
   * returned instead of a second one.
   */
  checkNovel(novelId: string): Promise<UpdateRun>;
  /** The novel's latest manual check, or null (404 for an unknown novel). */
  latestCheck(novelId: string): Promise<UpdateRun | null>;
  /** Every run, newest first. */
  listRuns(page: { page: number; limit: number }): Promise<UpdateRunPage>;
}

/** Manual checks go through the same scraper code as scheduled runs. */
export function createUpdateService(db: Database, options: { maxRetries: number }): UpdateService {
  async function requireNovelSource(novelId: string): Promise<string> {
    const source = await findNovelSource(db, novelId);
    if (source === null) throw new AppError(404, CATALOG_MESSAGES.novelNotFound);
    return source;
  }

  return {
    async checkNovel(novelId) {
      if ((await requireNovelSource(novelId)) === EPUB_SOURCE) {
        throw new AppError(409, UPDATE_MESSAGES.epub);
      }
      const runId = await db.withTransaction(
        async (tx) =>
          (await enqueueManualUpdateCheck(tx, { novelId, maxRetries: options.maxRetries })).runId,
      );
      const run = await findUpdateRun(db, runId);
      // Only a novel deleted in between takes its runs with it.
      if (!run) throw new AppError(404, CATALOG_MESSAGES.novelNotFound);
      return run;
    },

    async latestCheck(novelId) {
      await requireNovelSource(novelId);
      return findLatestManualRun(db, novelId);
    },

    async listRuns(page) {
      const { items, total } = await listUpdateRuns(db, page);
      return { items, total, ...page };
    },
  };
}
