import type { JobStatus, ScrapeErrorType } from './enums.js';
import type { NovelSummary } from './novels.js';
import type { SourceRef } from './sources.js';

/** Jobs in these states won't change again; clients stop polling. */
export const FINISHED_JOB_STATUSES = ['completed', 'failed'] as const satisfies JobStatus[];

export function isJobFinished(status: JobStatus): boolean {
  return (FINISHED_JOB_STATUSES as readonly JobStatus[]).includes(status);
}

/** A categorized scrape failure with a plain-language message. */
export interface ScrapeFailure {
  type: ScrapeErrorType;
  message: string;
}

/** Body of POST /api/import/url. */
export interface ImportUrlRequest {
  url: string;
}

/** EPUB uploads are at most 50 MB. */
export const EPUB_MAX_BYTES = 50 * 1024 * 1024;

/**
 * Response of POST /api/import/epub (multipart, the file in the field `file`): 201 with
 * `duplicate: false` for a new catalog novel; 200 with `duplicate: true` when the catalog
 * already had this exact file and the novel was added to the uploader's library.
 * An upload of a file already in the user's library is a 409 with an ImportConflict.
 */
export interface ImportEpubResponse {
  novel: NovelSummary;
  /** Words in all its chapters. */
  wordCount: number;
  duplicate: boolean;
}

/** Response of POST /api/import/url (202): the ingestion job to poll at GET /api/jobs/:id. */
export interface ImportUrlResponse {
  jobId: string;
}

/**
 * `data` of the 409 from POST /api/import/url: the URL is already a novel in the catalog
 *. The client offers "Open", or "Add to library" when `inLibrary` is false.
 */
export interface ImportConflict {
  novelId: string;
  title: string;
  inLibrary: boolean;
}

/**
 * Result of a completed `novel_ingestion` job. `duplicate` means the worker found the
 * novel already in the catalog (a URL that differs from the stored one but names the same
 * novel): no new record was created, and the novel was added to the requester's library.
 */
export interface IngestionResult {
  novelId: string;
  title: string;
  chapterCount: number;
  duplicate: boolean;
}

export interface ChapterFetchResult {
  wordCount: number;
}

export interface UpdateCheckResult {
  novelsChecked: number;
  newChapters: number;
}

export interface ManualUpdateCheckResult {
  newChapters: number;
}

interface JobFields {
  id: string;
  status: JobStatus;
  /** What the worker is doing, e.g. "Found 1,234 chapters"; shown while the job runs. */
  progressMessage: string | null;
  progressPercent: number | null;
  /**
   * The latest failure. While a retry waits (status `pending`) it is a short "retrying"
   * message; once the job has `failed`, the final plain-language reason.
   */
  error: ScrapeFailure | null;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  /** First time a worker picked the job up; kept across retries. */
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
}

export interface IngestionJob extends JobFields {
  type: 'novel_ingestion';
  /** The address the user submitted. */
  url: string | null;
  source: SourceRef | null;
  result: IngestionResult | null;
}

export interface ChapterFetchJob extends JobFields {
  type: 'chapter_fetch';
  novelId: string;
  chapterId: string;
  result: ChapterFetchResult | null;
}

export interface UpdateCheckJob extends JobFields {
  type: 'update_check';
  result: UpdateCheckResult | null;
}

export interface ManualUpdateCheckJob extends JobFields {
  type: 'manual_update_check';
  novelId: string;
  result: ManualUpdateCheckResult | null;
}

/** Result of a completed `novel_fetch_all` job. */
export interface FullFetchResult {
  /** Chapters this job stored. */
  fetched: number;
  /** Chapters it gave up on; each keeps its failure, shown in the chapter list. */
  failed: number;
}

export interface FullFetchJob extends JobFields {
  type: 'novel_fetch_all';
  novelId: string;
  result: FullFetchResult | null;
}

/** A scrape job as the API shows it to its owner; `type` tells which result it carries. */
export type Job =
  IngestionJob | ChapterFetchJob | UpdateCheckJob | ManualUpdateCheckJob | FullFetchJob;

/**
 * "Fetch all chapters" of a novel: the scraper stores every chapter not stored yet, one
 * at a time with long pauses, and each site fetches one novel at a time, first asked
 * first served ("Fetching a whole novel").
 */
export interface FullFetch {
  id: string;
  status: JobStatus;
  /** E.g. "Fetched 120 of 850 chapters", or why it is pausing; while it runs. */
  progressMessage: string | null;
  progressPercent: number | null;
  /** While it waits: whole novels from the same site that go first. */
  queuedBehind: number;
  /** The latest failure: a retry's short message while it waits, or why it stopped. */
  error: ScrapeFailure | null;
  /** The signed-in reader asked for it, and so may stop it. */
  canCancel: boolean;
  result: FullFetchResult | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

/**
 * Response of GET /api/novels/:id/fetch-all, and of POST (202, the fetch that was queued
 * or the one already waiting or running): the novel's latest whole-novel fetch, whoever
 * asked for it, and how many of its chapters are stored.
 */
export interface FullFetchResponse {
  fetch: FullFetch | null;
  /** Chapters whose text the server has. */
  storedChapters: number;
  /** Chapters on the source site (all of them, for a novel imported from one). */
  totalChapters: number;
}

/** Response of GET /api/jobs/:id. */
export interface JobResponse {
  job: Job;
}

/** Limits of GET /api/import/recent?limit=. */
export const RECENT_IMPORTS_LIMITS = { default: 10, max: 50 } as const;

/** Response of GET /api/import/recent: the user's URL imports, newest first. */
export interface RecentImportsResponse {
  jobs: IngestionJob[];
}
