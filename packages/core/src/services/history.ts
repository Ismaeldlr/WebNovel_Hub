import type {
  HistoryByNovelPage,
  HistoryNovelsResponse,
  HistoryPage,
  HistoryRange,
  HistoryStats,
  Profile,
} from '@webnovel-hub/shared';
import type { Queryable } from '../db/database.js';
import { deviceTimeZone } from '../db/values.js';
import {
  type HistoryCursor,
  historyByNovel,
  historyNovels,
  historyStats,
  listHistory,
} from '../repositories/history.js';
import { readProfileStats } from '../repositories/profile.js';

export interface HistoryQuery {
  range: HistoryRange;
  novelId: string | null;
}

export interface HistoryService {
  chapters(
    query: HistoryQuery & { cursor: HistoryCursor | null; limit: number },
  ): Promise<HistoryPage>;
  stats(query: HistoryQuery): Promise<HistoryStats>;
  novels(query: { q: string | null; limit: number }): Promise<HistoryNovelsResponse>;
  byNovel(query: { range: HistoryRange; page: number; limit: number }): Promise<HistoryByNovelPage>;
  profile(): Promise<Profile>;
}

/** Reading history and profile statistics, by the reader's local days. */
export function createHistoryService(db: Queryable): HistoryService {
  return {
    async chapters(query) {
      const page = await listHistory(
        db,
        { range: query.range, novelId: query.novelId },
        { cursor: query.cursor, limit: query.limit },
      );
      return { ...page, timezone: deviceTimeZone() };
    },

    stats: (query) => historyStats(db, query),

    novels: async (query) => ({ novels: await historyNovels(db, query) }),

    async byNovel(query) {
      const { items, total } = await historyByNovel(
        db,
        { range: query.range, novelId: null },
        query,
      );
      return { items, total, page: query.page, limit: query.limit };
    },

    async profile() {
      return { timezone: deviceTimeZone(), ...(await readProfileStats(db)) };
    },
  };
}
