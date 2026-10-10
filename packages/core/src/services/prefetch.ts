import type { Queryable } from '../db/database.js';
import type { Logger } from '../logger.js';
import { enqueuePrefetch } from '../repositories/jobs.js';
import { findPrefetchCount } from '../repositories/preferences.js';

export interface Prefetcher {
  /**
   * Queues background fetches for the next `prefetch_count` chapters, starting at
   * `fromChapter`. Resolves to the number of jobs queued.
   */
  queue(novelId: string, fromChapter: number): Promise<number>;
  /** `queue` without waiting: a failure is logged, never reported to the caller. */
  queueInBackground(novelId: string, fromChapter: number): void;
}

export function createPrefetcher(options: {
  db: Queryable;
  logger: Logger;
  maxRetries: number;
  /** Called when fetches were queued, so the job runner starts on them. */
  onQueued?: () => void;
}): Prefetcher {
  const { db, logger, maxRetries } = options;

  const queue = async (novelId: string, fromChapter: number) => {
    const count = await findPrefetchCount(db);
    if (count === 0) return 0;
    const queued = await enqueuePrefetch(db, {
      novelId,
      fromNumber: fromChapter,
      count,
      maxRetries,
    });
    if (queued > 0) options.onQueued?.();
    return queued;
  };

  return {
    queue,
    queueInBackground(novelId, fromChapter) {
      queue(novelId, fromChapter).then(
        (queued) => {
          if (queued > 0) logger.debug({ novelId, queued }, 'chapters queued for prefetch');
        },
        (error: unknown) => logger.warn({ err: error, novelId }, 'prefetch could not be queued'),
      );
    },
  };
}
