import type { LibraryStatus } from './enums.js';
import type { NovelSummary } from './novels.js';
import type { SourceRef } from './sources.js';

/** History ranges: everything, or the last 7 or 30 days in the reader's time zone. */
export const HISTORY_RANGES = ['all', '7d', '30d'] as const;
export type HistoryRange = (typeof HISTORY_RANGES)[number];

/** GET /api/history: chapter entries per page. */
export const HISTORY_LIMITS = { default: 50, max: 100 } as const;
/** GET /api/history/by-novel: novels per page. */
export const HISTORY_BY_NOVEL_LIMITS = { default: 24, max: 100 } as const;
/** GET /api/history/novels: novels for the filter. */
export const HISTORY_NOVELS_LIMITS = { default: 20, max: 100 } as const;

/** A novel as a history entry names it. */
export interface HistoryNovelRef {
  id: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
}

/**
 * A chapter read. The chapter view lists each chapter once per day it was read, at the
 * latest read that day (reading_history keeps every view).
 */
export interface HistoryEntry {
  /** The reading_history row. */
  id: string;
  readAt: string;
  /** The day in the reader's time zone, `YYYY-MM-DD`: what the page groups by. */
  date: string;
  novel: HistoryNovelRef;
  chapter: { number: number; title: string };
}

/** Response of GET /api/history?range&novelId&cursor&limit. */
export interface HistoryPage {
  items: HistoryEntry[];
  /** Pass as `cursor` for the next page; null on the last one. */
  nextCursor: string | null;
  /** The reader's time zone, which `date` and the ranges use. */
  timezone: string;
}

/** Response of GET /api/history/stats?range&novelId: the summary above the history. */
export interface HistoryStats {
  /** Distinct chapters, novels and authors read in the range. */
  chaptersRead: number;
  novelsRead: number;
  authorsRead: number;
  /** Every chapter view, re-reads included. */
  reads: number;
}

/** Response of GET /api/history/novels?q&limit: novels in the history, for its filter. */
export interface HistoryNovelsResponse {
  novels: (HistoryNovelRef & { lastReadAt: string })[];
}

/** One novel of GET /api/history/by-novel. */
export interface HistoryNovelItem {
  novel: NovelSummary;
  /** Distinct chapters read in the range, and every view of them. */
  chaptersRead: number;
  reads: number;
  lastReadAt: string;
  /** The chapter read most recently. */
  lastChapter: { number: number; title: string };
  /** For progress: the library's furthest chapter, else the highest chapter read. */
  furthestChapterNumber: number;
  /** Where Continue Reading opens: the library's last chapter read, else `lastChapter`. */
  continueChapterNumber: number;
  inLibrary: boolean;
}

/** Response of GET /api/history/by-novel?range&page&limit: most recently read first. */
export interface HistoryByNovelPage {
  items: HistoryNovelItem[];
  page: number;
  limit: number;
  total: number;
}

/** How many days the profile's activity covers. */
export const PROFILE_ACTIVITY_DAYS = 90;

/** GET /api/user/profile. Days are the reader's (`timezone`). */
export interface Profile {
  timezone: string;
  totals: {
    /** Distinct chapters, novels and authors ever read. */
    chaptersRead: number;
    novelsRead: number;
    authorsRead: number;
    /** Words in the distinct chapters read. */
    wordsRead: number;
    /** Days with at least one chapter read. */
    readingDays: number;
    /** Every chapter view, re-reads included. */
    reads: number;
  };
  streaks: {
    /** Consecutive days read up to today, or up to yesterday while today has none yet. */
    current: number;
    longest: number;
    lastReadDate: string | null;
  };
  /** The last 90 days, oldest first and today last, with the distinct chapters read. */
  activity: { date: string; chapters: number }[];
  library: {
    total: number;
    byStatus: Record<LibraryStatus, number>;
    /** Sources with at least one novel in the library, most first. */
    bySource: { source: SourceRef; count: number }[];
  };
  /** Up to five novels with the most distinct chapters read. */
  mostRead: { novel: NovelSummary; chaptersRead: number }[];
  /** Of the novels read from, the one with the most chapters. */
  longestNovel: { novel: NovelSummary; chaptersRead: number } | null;
}

export interface ProfileResponse {
  profile: Profile;
}
