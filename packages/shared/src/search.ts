import type { NovelSummary } from './novels.js';

/** The global search asks once the text has `minLength` characters, and shows at most `max` results. */
export const SEARCH_LIMITS = { minLength: 2, default: 5, max: 5 } as const;

/** One global-search result. */
export interface SearchResult {
  novel: NovelSummary;
  inLibrary: boolean;
}

/**
 * The best matches for the search text (a title equal to it, then titles starting with
 * it, then any other title or author match), and how many novels match in all.
 */
export interface SearchResponse {
  results: SearchResult[];
  total: number;
}
