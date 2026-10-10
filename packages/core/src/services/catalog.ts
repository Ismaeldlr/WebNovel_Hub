import type {
  ChapterOrder,
  ChapterPage,
  Job,
  NovelDetail,
  SearchResponse,
} from '@webnovel-hub/shared';
import type { Queryable } from '../db/database.js';
import { AppError } from '../errors.js';
import { searchCatalog } from '../repositories/catalog.js';
import { findJob } from '../repositories/jobs.js';
import { findNovel, listChapters, novelExists } from '../repositories/novels.js';
import type { Prefetcher } from './prefetch.js';

export const CATALOG_MESSAGES = {
  novelNotFound: 'Novel not found.',
  jobNotFound: 'Job not found.',
} as const;

export interface ChapterPageRequest {
  page: number;
  limit: number;
  order: ChapterOrder;
  q: string | null;
}

export interface CatalogService {
  /**
   * The novel with its library state. Also queues, in the background, the chapters the
   * reader is about to read: from their Continue Reading chapter, or chapter 1.
   */
  getNovel(novelId: string): Promise<NovelDetail>;
  listChapters(novelId: string, request: ChapterPageRequest): Promise<ChapterPage>;
  getJob(jobId: string): Promise<Job>;
  /** The global search's best matches. */
  search(request: { q: string; limit: number }): Promise<SearchResponse>;
}

export function createCatalogService(db: Queryable, prefetcher: Prefetcher): CatalogService {
  return {
    async getNovel(novelId) {
      const novel = await findNovel(db, novelId);
      if (!novel) throw new AppError(404, CATALOG_MESSAGES.novelNotFound);
      prefetcher.queueInBackground(novelId, novel.library?.lastReadChapterNumber ?? 1);
      return novel;
    },

    async listChapters(novelId, request) {
      const [exists, found] = await Promise.all([
        novelExists(db, novelId),
        listChapters(db, { novelId, ...request }),
      ]);
      if (!exists) throw new AppError(404, CATALOG_MESSAGES.novelNotFound);
      return { ...found, page: request.page, limit: request.limit, order: request.order };
    },

    async getJob(jobId) {
      const job = await findJob(db, jobId);
      if (!job) throw new AppError(404, CATALOG_MESSAGES.jobNotFound);
      return job;
    },

    search: (request) => searchCatalog(db, request),
  };
}
