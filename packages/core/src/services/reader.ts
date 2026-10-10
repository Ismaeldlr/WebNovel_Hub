import type {
  ChapterFetchResponse,
  ChapterNotFound,
  ReadChapterResponse,
  ReaderChapterResponse,
  ReaderFetching,
} from '@webnovel-hub/shared';
import type { Database } from '../db/database.js';
import { AppError } from '../errors.js';
import {
  type ChapterFetchJobState,
  enqueueChapterFetch,
  findActiveChapterJob,
} from '../repositories/jobs.js';
import { findLibraryItem } from '../repositories/library.js';
import { findPreferences } from '../repositories/preferences.js';
import { type ReaderLookup, findReaderChapter, recordRead } from '../repositories/reader.js';
import { CATALOG_MESSAGES } from './catalog.js';
import type { Prefetcher } from './prefetch.js';

export const READER_MESSAGES = {
  invalidChapter: 'Chapter numbers are whole numbers, starting at 1.',
  chapterNotFound: 'This novel has no chapter with that number.',
  notFetched: "This chapter hasn't been downloaded yet, so it can't be marked as read.",
  /** An EPUB chapter without stored text: there is nowhere to fetch it from. */
  noSource: "This chapter's text is missing, and there is no source to fetch it from.",
} as const;

export interface ReaderService {
  /**
   * A chapter to read. Stored text → `ready`, and the next `prefetch_count` chapters are
   * queued in the background. Missing text → a priority-0 `chapter_fetch` job is ensured
   * and the chapter is `fetching`. A last fetch that failed for good → `failed`, until
   * `fetchChapter` tries again.
   */
  getChapter(novelId: string, number: number): Promise<ReaderChapterResponse>;
  /** Queues a new fetch of a chapter, e.g. after a failure. */
  fetchChapter(novelId: string, number: number): Promise<ChapterFetchResponse>;
  /** Records a read and moves the reading progress. */
  markRead(novelId: string, number: number): Promise<ReadChapterResponse>;
}

type FoundChapter = ReaderLookup & { chapter: NonNullable<ReaderLookup['chapter']> };

export function createReaderService(options: {
  db: Database;
  prefetcher: Prefetcher;
  maxRetries: number;
  /** Called when a fetch was queued, so the job runner starts on it. */
  onQueued?: () => void;
}): ReaderService {
  const { db, prefetcher, maxRetries } = options;

  /** The chapter, or the 404 that says what is missing. */
  const find = async (novelId: string, number: number) => {
    const found = await findReaderChapter(db, { novelId, number });
    if (!found) throw new AppError(404, CATALOG_MESSAGES.novelNotFound);
    if (!found.chapter) {
      throw new AppError(404, READER_MESSAGES.chapterNotFound, {
        data: { totalChapters: found.novel.totalChapters } satisfies ChapterNotFound,
      });
    }
    return found as FoundChapter;
  };

  const view = ({ novel, library, chapter }: FoundChapter) => ({
    novel,
    chapter: chapter.view,
    navigation: chapter.navigation,
    library,
  });

  const fetching = (found: FoundChapter, job: ChapterFetchJobState): ReaderFetching => ({
    ...view(found),
    status: 'fetching',
    jobId: job.id,
    job,
  });

  const enqueue = async (found: FoundChapter) => {
    const job = await enqueueChapterFetch(db, {
      novelId: found.novel.id,
      chapterId: found.chapter.view.id,
      maxRetries,
    });
    options.onQueued?.();
    return job;
  };

  return {
    async getChapter(novelId, number) {
      const found = await find(novelId, number);
      const { chapter } = found;

      if (chapter.content) {
        const preferences = await findPreferences(db);
        // After the response, without delaying it.
        prefetcher.queueInBackground(novelId, chapter.view.number + 1);
        return {
          ...view(found),
          status: 'ready',
          content: chapter.content.text,
          wordCount: chapter.content.wordCount,
          preferences,
        };
      }

      if (chapter.fetchFailure) {
        // A retry the reader asked for may be under way; otherwise the failure stands.
        const active = await findActiveChapterJob(db, chapter.view.id);
        return active
          ? fetching(found, active)
          : { ...view(found), status: 'failed', error: chapter.fetchFailure };
      }

      if (chapter.sourceUrl === null) {
        return {
          ...view(found),
          status: 'failed',
          error: { type: 'unknown', message: READER_MESSAGES.noSource },
        };
      }

      return fetching(found, await enqueue(found));
    },

    async fetchChapter(novelId, number) {
      const found = await find(novelId, number);
      if (found.chapter.content) return { jobId: null };
      if (found.chapter.sourceUrl === null) throw new AppError(409, READER_MESSAGES.noSource);
      return { jobId: (await enqueue(found)).id };
    },

    async markRead(novelId, number) {
      const { chapter } = await find(novelId, number);
      if (!chapter.content) throw new AppError(409, READER_MESSAGES.notFetched);
      await db.withTransaction((tx) =>
        recordRead(tx, { novelId, chapterId: chapter.view.id, number }),
      );
      const item = await findLibraryItem(db, novelId);
      return { library: item?.library ?? null };
    },
  };
}
