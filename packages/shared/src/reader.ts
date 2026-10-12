import type { JobStatus } from './enums.js';
import type { ScrapeFailure } from './jobs.js';
import type { LibraryState } from './novels.js';
import type { ReaderPreferences } from './preferences.js';
import type { SourceRef } from './sources.js';

/** The novel a reader view belongs to. */
export interface ReaderNovel {
  id: string;
  title: string;
  author: string | null;
  source: SourceRef;
  totalChapters: number;
}

/** The chapter being read. `number` is its 1..N position. */
export interface ReaderChapter {
  id: string;
  number: number;
  title: string;
  publishedAt: string | null;
}

/** A neighbouring chapter, for the previous / next controls. */
export interface ReaderChapterLink {
  number: number;
  title: string;
}

/** Previous / next availability: null at either end of the novel. */
export interface ReaderNavigation {
  previous: ReaderChapterLink | null;
  next: ReaderChapterLink | null;
}

interface ReaderView {
  novel: ReaderNovel;
  chapter: ReaderChapter;
  navigation: ReaderNavigation;
  /** The user's library entry; null when the novel isn't in their library. */
  library: LibraryState | null;
}

/** 200: the chapter's text is stored locally. */
export interface ReaderReady extends ReaderView {
  status: 'ready';
  /**
   * Normalized plain text: paragraphs separated by a blank line, line breaks as `\n`.
   * Render it as text, never as HTML.
   */
  content: string;
  wordCount: number;
  preferences: ReaderPreferences;
}

/** The chapter_fetch job a fetching chapter waits for. */
export interface ReaderFetchJob {
  id: string;
  status: JobStatus;
  progressMessage: string | null;
  /** While a retry waits: the short "retrying" message of the failed attempt. */
  error: ScrapeFailure | null;
}

/**
 * 202: the text isn't stored yet. A `chapter_fetch` job exists;
 * ask again (the reader polls every ~1.5 s) until the chapter is ready or failed.
 */
export interface ReaderFetching extends ReaderView {
  status: 'fetching';
  jobId: string;
  job: ReaderFetchJob;
}

/** 200: the last fetch failed for good; POST …/fetch tries again. */
export interface ReaderFailed extends ReaderView {
  status: 'failed';
  error: ScrapeFailure;
}

/** Response of GET /reader/:novelId/chapters/:chapterNumber. */
export type ReaderChapterResponse = ReaderReady | ReaderFetching | ReaderFailed;

/**
 * `data` of the 404 from the reader endpoints when the novel exists but has no chapter
 * with that number, so the client can offer its last chapter.
 */
export interface ChapterNotFound {
  totalChapters: number;
}

/**
 * Response of POST /reader/:novelId/chapters/:chapterNumber/fetch: 202 with the job
 * when a fetch was queued, 200 with `jobId: null` when the text is already stored.
 */
export interface ChapterFetchResponse {
  jobId: string | null;
}

/**
 * Response of POST /reader/:novelId/chapters/:chapterNumber/read: the library entry
 * after the progress update, or null when the novel isn't in the library (history only).
 */
export interface ReadChapterResponse {
  library: LibraryState | null;
}

/**
 * Splits normalized chapter text into paragraphs (blank-line separated) and their lines
 * ("Chapter text"). The reader and the EPUB export lay text out with it.
 */
export function chapterParagraphs(text: string): string[][] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n[^\S\n]*\n\s*/)
    .map((paragraph) => paragraph.replace(/^\n+|\n+$/g, ''))
    .filter((paragraph) => paragraph.trim() !== '')
    .map((paragraph) => paragraph.split('\n'));
}
