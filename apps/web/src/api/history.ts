import type {
  HistoryByNovelPage,
  HistoryNovelsResponse,
  HistoryPage,
  HistoryRange,
  HistoryStats,
} from '@webnovel-hub/shared';
import { apiRequest } from './client';

/** Builds `?a=1&b=x` from the defined, non-empty values. */
function query(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export interface HistoryFilter {
  range: HistoryRange;
  /** Only this novel's reads; null for all. */
  novelId: string | null;
}

/** /history. */
export const historyApi = {
  chapters: (filter: HistoryFilter, cursor: string | null, signal?: AbortSignal) =>
    apiRequest<HistoryPage>(
      `/history${query({ range: filter.range, novelId: filter.novelId, cursor })}`,
      { signal },
    ),
  stats: (filter: HistoryFilter, signal?: AbortSignal) =>
    apiRequest<HistoryStats>(
      `/history/stats${query({ range: filter.range, novelId: filter.novelId })}`,
      { signal },
    ),
  byNovel: (range: HistoryRange, page: number, signal?: AbortSignal) =>
    apiRequest<HistoryByNovelPage>(`/history/by-novel${query({ range, page })}`, { signal }),
  novels: async (q: string, signal?: AbortSignal) =>
    (await apiRequest<HistoryNovelsResponse>(`/history/novels${query({ q })}`, { signal })).novels,
};
