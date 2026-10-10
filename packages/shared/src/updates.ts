import type { JobStatus, ScrapeErrorType, UpdateRunTrigger } from './enums.js';
import type { ScrapeFailure } from './jobs.js';

/** A novel whose check failed during an update run. */
export interface UpdateRunError {
  novelId: string;
  /** The novel's title when it was checked. */
  title: string;
  type: ScrapeErrorType;
  /** Plain-language reason, e.g. "We couldn't reach Royal Road to check for new chapters." */
  message: string;
}

/**
 * One update run: the scheduled check of every novel someone reads or
 * follows, or a manual check of one novel. Its status follows its job.
 */
export interface UpdateRun {
  id: string;
  trigger: UpdateRunTrigger;
  status: JobStatus;
  /** The novel a manual check is about; null for scheduled runs. */
  novel: { id: string; title: string } | null;
  novelsChecked: number;
  newChaptersFound: number;
  /**
   * Novels whose check failed. A scheduled run lists only the novels in the signed-in
   * user's library; its counts cover every novel it checked.
   */
  errors: UpdateRunError[];
  /** What the worker is doing while the run is active, e.g. "Checked 12 / 40". */
  progressMessage: string | null;
  progressPercent: number | null;
  /**
   * The run's own failure: while a retry waits (status `pending`), a short "retrying"
   * message; once it has `failed`, the final plain-language reason.
   */
  error: ScrapeFailure | null;
  createdAt: string;
  /** First time a worker picked the run up; kept across retries. */
  startedAt: string | null;
  finishedAt: string | null;
}

/**
 * Response of POST /api/novels/:id/update-check (202): the manual check that was queued,
 * or the novel's check that was already waiting or running.
 */
export interface StartUpdateCheckResponse {
  check: UpdateRun;
}

/**
 * Response of GET /api/novels/:id/update-check: the novel's latest manual check, whoever
 * asked for it, or null if nobody has. Clients poll it while the check is active.
 */
export interface UpdateCheckResponse {
  check: UpdateRun | null;
}

/** Limits of GET /api/update-jobs?limit=. */
export const UPDATE_RUN_PAGE_LIMITS = { default: 20, max: 100 } as const;

/**
 * Response of GET /api/update-jobs?page=&limit=: scheduled runs and the user's own manual
 * checks, newest first.
 */
export interface UpdateRunPage {
  items: UpdateRun[];
  /** 1-based page number. */
  page: number;
  limit: number;
  /** Runs across every page. */
  total: number;
}
