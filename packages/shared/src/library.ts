import type { LibraryStatus } from './enums.js';
import type { LibraryState, NovelSummary } from './novels.js';
import type { SourceKey } from './sources.js';

/** A novel in the library. */
export interface LibraryItem {
  novel: NovelSummary;
  library: LibraryState;
}

/** Limits of GET /library?limit=. */
export const LIBRARY_PAGE_LIMITS = { default: 24, max: 100 } as const;

/**
 * Orders of GET /library?sort=, each in its natural direction:
 * - `last_read`: most recently read first; a novel never read counts from when it was added.
 * - `last_updated`: newest chapter first; novels without chapter dates last.
 * - `title`: A to Z.
 * - `added`: most recently added first.
 * - `progress`: furthest along (furthest chapter out of the total) first.
 */
export const LIBRARY_SORTS = ['last_read', 'last_updated', 'title', 'added', 'progress'] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];
export const DEFAULT_LIBRARY_SORT: LibrarySort = 'last_read';

/**
 * Query of GET /library. Every filter is optional, and the ones given
 * must all match.
 */
export interface LibraryQuery {
  /** One status (omitted: all). */
  status?: LibraryStatus;
  /** One source (omitted: all). */
  source?: SourceKey;
  /** `true` for favourites only (`false`: only the others). */
  favorite?: boolean;
  /** `true` for novels with unread NEW chapters only (`false`: without). */
  unread?: boolean;
  /** One tag the novel must have, ignoring case (omitted: any). */
  tag?: string;
  sort?: LibrarySort;
  /** Words that must each appear in the title or the author. */
  q?: string;
  page?: number;
  limit?: number;
}

/** A tag of novels in the library, with how many of them have it. */
export interface LibraryTag {
  tag: string;
  novels: number;
}

/** Response of GET /library/tags: every tag in the library, A to Z, ignoring case. */
export interface LibraryTagsResponse {
  tags: LibraryTag[];
}

/** Response of GET /library: the novels that match, in `sort` order. */
export interface LibraryPage {
  items: LibraryItem[];
  /** 1-based page number. */
  page: number;
  limit: number;
  sort: LibrarySort;
  /** Novels matching the filters (the whole library without any), across every page. */
  total: number;
}

/**
 * Response of POST /library/:novelId (201 when added, 200 when it already was) and of
 * the PATCH endpoints.
 */
export interface LibraryItemResponse {
  item: LibraryItem;
}

/** Response of GET /library/stats: the library page's summary. */
export interface LibraryStats {
  total: number;
  byStatus: Record<LibraryStatus, number>;
  favorites: number;
  /** Unread NEW chapters across the library, and how many novels have some. */
  newChapters: number;
  novelsWithNewChapters: number;
  /** The most recent update check of any novel in the library. */
  lastCheckedAt: string | null;
}

/** Response of GET /library/new-chapters-count. */
export interface NewChaptersCount {
  count: number;
}

/** A novel that made its own choice about notifications of its new chapters. */
export interface NovelNotifyChoice {
  novelId: string;
  title: string;
  /** True: always told; false: never. */
  notify: boolean;
}

/** Response of GET /library/notify: the novels with their own choice, by title. */
export interface NotifyChoicesResponse {
  novels: NovelNotifyChoice[];
}
