import type { LibraryStatus } from './enums.js';
import type { ScrapeFailure } from './jobs.js';
import type { SourceRef } from './sources.js';

/** The signed-in user's library entry for a novel. */
export interface LibraryState {
  status: LibraryStatus;
  isFavorite: boolean;
  /** The Continue Reading target; null until the first chapter is read. */
  lastReadChapterNumber: number | null;
  /** The furthest chapter reached, which drives the progress bar. */
  furthestChapterNumber: number | null;
  /** Chapters found by update checks that the user hasn't opened. */
  newChapterCount: number;
  addedAt: string;
  lastReadAt: string | null;
}

/** A catalog novel with the signed-in user's library state. */
/** What a card or list row shows about a catalog novel. */
export interface NovelSummary {
  id: string;
  source: SourceRef;
  title: string;
  author: string | null;
  /**
   * Root-relative URL of the locally stored cover on the API's origin, e.g.
   * `/covers/<file>`; resolve it against the API origin (not VITE_API_URL's `/api`).
   * Null when the novel has no cover.
   */
  coverUrl: string | null;
  totalChapters: number;
  /** Set when the latest update check failed. */
  updateFailure: ScrapeFailure | null;
  /** Latest update-check attempt. */
  lastCheckedAt: string | null;
  latestChapterAt: string | null;
}

export interface NovelDetail extends NovelSummary {
  /** The novel's page on its source site; null for EPUB imports. */
  sourceUrl: string | null;
  description: string | null;
  tags: string[];
  /** Latest successful scrape of the metadata and chapter list. */
  lastScrapedAt: string | null;
  /** When the novel was added to the catalog. */
  createdAt: string;
  updatedAt: string;
  /** Null when the novel has no library entry. */
  library: LibraryState | null;
}

/** Limits of the details a reader may edit (PATCH /novels/:id). */
export const NOVEL_DETAIL_LIMITS = {
  title: 300,
  author: 200,
  description: 20_000,
  tags: 30,
  tag: 60,
} as const;

/** Body of PATCH /novels/:id: any of these, at least one; never chapter text. */
export interface NovelDetailsUpdate {
  title?: string;
  /** Empty or null clears it. */
  author?: string | null;
  description?: string | null;
  tags?: string[];
}

/** Uploaded covers (POST /novels/:id/cover, field `cover`): JPEG, PNG or WebP. */
export const COVER_UPLOAD = {
  maxBytes: 8 * 1024 * 1024,
  extensions: ['jpg', 'jpeg', 'png', 'webp'],
  mediaTypes: ['image/jpeg', 'image/png', 'image/webp'],
} as const;

/** Response of GET /novels/:id. */
export interface NovelResponse {
  novel: NovelDetail;
}

/** One row of a novel's chapter list. */
export interface ChapterSummary {
  id: string;
  /** Position in reading order, 1..N; the reader route uses it. */
  number: number;
  /** The source's own label, e.g. "Ch. 12.5 - The Bridge". */
  title: string;
  publishedAt: string | null;
  /** Whether the text is stored locally (read without scraping). */
  isFetched: boolean;
  /** Why the last fetch failed, if it did. */
  fetchFailure: ScrapeFailure | null;
  /** The user has opened this chapter (it is in their reading history). */
  isRead: boolean;
  /** Found by an update check and not opened by the user yet. */
  isNew: boolean;
}

export const CHAPTER_ORDERS = ['asc', 'desc'] as const;
export type ChapterOrder = (typeof CHAPTER_ORDERS)[number];

/** Limits of GET /novels/:id/chapters?limit= (at most 200 per request). */
export const CHAPTER_PAGE_LIMITS = { default: 50, max: 200 } as const;

/** Response of GET /novels/:id/chapters?page=&limit=&order=&q=. */
export interface ChapterPage {
  chapters: ChapterSummary[];
  /** 1-based page number. */
  page: number;
  limit: number;
  order: ChapterOrder;
  /** Chapters matching `q` (all chapters without it), across every page. */
  total: number;
}
