import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import { PREFERENCES_QUERY_KEY } from '../features/preferences/store';

/** Query keys. */
export const queryKeys = {
  /** Opening the library when the app starts. */
  open: ['open'] as const,
  sources: ['sources'] as const,
  /** Whether the app is signed in to a site (WTR Lab). */
  account: (source: string) => ['account', source] as const,
  /** Everything under the library: its lists, its summary and the sidebar's NEW count. */
  library: ['library'] as const,
  /** Every filtered and sorted list of the library; `libraryList` is one of them. */
  libraryLists: ['library', 'list'] as const,
  libraryList: (params: object) => ['library', 'list', params] as const,
  libraryStats: ['library', 'stats'] as const,
  libraryTags: ['library', 'tags'] as const,
  newChaptersCount: ['library', 'new-chapters-count'] as const,
  /** A novel's page; its chapter pages and update check live under the same prefix. */
  novel: (novelId: string) => ['novel', novelId] as const,
  chapters: (novelId: string, params: object) => ['novel', novelId, 'chapters', params] as const,
  updateCheck: (novelId: string) => ['novel', novelId, 'update-check'] as const,
  /** Its "Fetch all chapters" and how many chapters are stored. */
  fullFetch: (novelId: string) => ['novel', novelId, 'full-fetch'] as const,
  /** The Exports page: the novels asked to be fetched in full. */
  exports: ['exports'] as const,
  /** The Update Jobs page. */
  updateRuns: ['update-runs'] as const,
  /** The global search's results. */
  searches: ['search'] as const,
  search: (q: string) => ['search', q] as const,
  /** The reader's view of a chapter; `readerNovel` covers every chapter of a novel. */
  reader: (novelId: string, chapter: number) => ['reader', novelId, chapter] as const,
  readerNovel: (novelId: string) => ['reader', novelId] as const,
  job: (jobId: string) => ['job', jobId] as const,
  recentImports: ['imports', 'recent'] as const,
  /** Reading History: its chapter pages, summary, novel view and filter lists. */
  history: ['history'] as const,
  historyChapters: (params: object) => ['history', 'chapters', params] as const,
  historyStats: (params: object) => ['history', 'stats', params] as const,
  historyByNovel: (params: object) => ['history', 'by-novel', params] as const,
  historyNovels: (q: string) => ['history', 'novels', q] as const,
  /** Every list of terms; `novelTerms` is those a novel's chapters use. */
  terms: ['terms'] as const,
  novelTerms: (novelId: string) => ['terms', 'novel', novelId] as const,
  /** The profile's statistics. */
  profile: ['profile'] as const,
  /** The reader preferences, saved in the background by features/preferences. */
  preferences: PREFERENCES_QUERY_KEY,
};

/** Retries unexpected errors; a 4xx answer won't change by asking again. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: 30_000 },
      mutations: { retry: false },
    },
  });
}
