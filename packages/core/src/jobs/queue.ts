// The `scrape_jobs` queue as the runner sees it. Every write after the claim is guarded
// by `status = 'running'`: when it matches nothing, the job was taken away (cancelled, or
// deleted with its novel) and `JobLost` is thrown, so a job that is gone stays gone.
import type { JobType } from '@webnovel-hub/shared';
import type { Database, Queryable } from '../db/database.js';
import { NOW, nowPlus } from '../db/sql.js';
import { parseJson } from '../db/values.js';
import { QUEUED_MESSAGE } from '../repositories/jobs.js';
import { RateLimited, type ScrapeError } from '../scraper/errors.js';
import { MAX_RETRY_AFTER } from '../scraper/session.js';

/** The first retry waits this long; each further retry doubles it. */
const BASE_RETRY_DELAY = 30_000;
/** A rate-limited job waits at least this long before its retry. */
const MIN_RATE_LIMIT_DELAY = 120_000;
/** Delays vary by up to ±20 %, so that retries of many jobs don't arrive together. */
const JITTER = 0.2;

export const FULL_FETCH = 'novel_fetch_all';

/** The job was cancelled or deleted while it ran. */
export class JobLost extends Error {
  constructor(jobId: string) {
    super(`job ${jobId} no longer exists or no longer runs`);
    this.name = 'JobLost';
  }
}

export interface ClaimedJob {
  id: string;
  type: JobType;
  novelId: string | null;
  chapterId: string | null;
  updateRunId: string | null;
  payload: Record<string, unknown>;
  retryCount: number;
  maxRetries: number;
  /** The address the job is about, for naming its site: null for scheduled checks. */
  sourceUrl: string | null;
}

interface JobRow {
  id: string;
  type: JobType;
  novel_id: string | null;
  chapter_id: string | null;
  update_run_id: string | null;
  payload: string;
  retry_count: number;
  max_retries: number;
  source_url: string | null;
}

const SELECT_CLAIMED = `
  SELECT j.id, j.type, j.novel_id, j.chapter_id, j.update_run_id, j.payload, j.retry_count,
         j.max_retries,
         coalesce(j.payload ->> 'url',
                  (SELECT c.source_url FROM chapters c WHERE c.id = j.chapter_id),
                  (SELECT n.source_url FROM novels n WHERE n.id = j.novel_id)) AS source_url
  FROM scrape_jobs j WHERE j.id = $1`;

const toJob = (row: JobRow): ClaimedJob => ({
  id: row.id,
  type: row.type,
  novelId: row.novel_id,
  chapterId: row.chapter_id,
  updateRunId: row.update_run_id,
  payload: parseJson<Record<string, unknown>>(row.payload, {}),
  retryCount: row.retry_count,
  maxRetries: row.max_retries,
  sourceUrl: row.source_url,
});

const START = `status = 'running', started_at = coalesce(started_at, ${NOW})`;

async function claimed(db: Queryable, id: string | undefined): Promise<ClaimedJob | null> {
  if (!id) return null;
  const { rows } = await db.query<JobRow>(SELECT_CLAIMED, [id]);
  return rows[0] ? toJob(rows[0]) : null;
}

/** Starts the next waiting job of one of `types`, highest priority first; null if none. */
export async function claimJob(
  db: Database,
  types: readonly JobType[],
): Promise<ClaimedJob | null> {
  const { rows } = await db.query<{ id: string }>(
    `UPDATE scrape_jobs SET ${START}
     WHERE id = (
       SELECT id FROM scrape_jobs
       WHERE status = 'pending' AND available_at <= ${NOW}
         AND type IN (SELECT value FROM json_each($1))
       ORDER BY priority, created_at LIMIT 1)
     RETURNING id`,
    [types],
  );
  return claimed(db, rows[0]?.id);
}

/**
 * Starts the oldest waiting whole-novel fetch of a site that isn't fetching one already;
 * null if there is none. A site's queue is first come, first served: one waiting for a
 * retry holds up those asked for after it.
 */
export async function claimFullFetch(db: Database): Promise<ClaimedJob | null> {
  const { rows } = await db.query<{ id: string }>(
    `UPDATE scrape_jobs SET ${START}
     WHERE id = (
       SELECT q.id FROM scrape_jobs q
       WHERE q.type = 'novel_fetch_all' AND q.status = 'pending' AND q.available_at <= ${NOW}
         AND NOT EXISTS (
           SELECT 1 FROM scrape_jobs a
           WHERE a.type = 'novel_fetch_all' AND a.payload ->> 'source' = q.payload ->> 'source'
             AND (a.status = 'running'
                  OR (a.status = 'pending' AND (a.created_at, a.id) < (q.created_at, q.id))))
       ORDER BY q.created_at, q.id LIMIT 1)
     RETURNING id`,
  );
  return claimed(db, rows[0]?.id);
}

/** Whether the job still exists and runs. */
export async function isRunning(db: Queryable, jobId: string): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM scrape_jobs WHERE id = $1 AND status = 'running'`,
    [jobId],
  );
  return rows.length > 0;
}

async function guarded(
  db: Queryable,
  job: ClaimedJob,
  set: string,
  values: unknown[],
): Promise<void> {
  const { rowCount } = await db.query(
    `UPDATE scrape_jobs SET ${set} WHERE id = $1 AND status = 'running'`,
    [job.id, ...values],
  );
  if (rowCount === 0) throw new JobLost(job.id);
}

/** Shows the reader how the job is getting on. */
export function reportProgress(
  db: Queryable,
  job: ClaimedJob,
  message: string,
  percent: number | null,
): Promise<void> {
  return guarded(db, job, 'progress_message = $2, progress_percent = $3', [message, percent]);
}

export function completeJob(
  db: Queryable,
  job: ClaimedJob,
  result: Record<string, unknown>,
): Promise<void> {
  return guarded(
    db,
    job,
    `status = 'completed', result = $2, finished_at = ${NOW}, progress_percent = 100,
     error_type = NULL, error_message = NULL, error_detail = NULL`,
    [result],
  );
}

/** What happens to a job after a failed attempt. */
export interface FailurePlan {
  final: boolean;
  /** Milliseconds until the retry may start; null when final. */
  delay: number | null;
  /** The reason the reader sees. */
  message: string;
  /** Shown while the retry waits. */
  progress: string | null;
}

/** 30 s × 2^retries, ±20 %; at least 2 minutes (or the site's Retry-After) when limited. */
export function retryDelay(retryCount: number, error: ScrapeError, random: () => number): number {
  let delay = BASE_RETRY_DELAY * 2 ** retryCount * (1 + (random() * 2 - 1) * JITTER);
  if (error instanceof RateLimited) {
    delay = Math.max(delay, MIN_RATE_LIMIT_DELAY, Math.min(error.retryAfter ?? 0, MAX_RETRY_AFTER));
  }
  return delay;
}

/** Whether a failed attempt is tried again rather than failing the job. */
export const willRetry = (job: Pick<ClaimedJob, 'retryCount' | 'maxRetries'>, error: ScrapeError) =>
  error.retryable && job.retryCount < job.maxRetries;

const about = (ms: number) =>
  ms < 90_000 ? `${Math.round(ms / 1000)} seconds` : `${Math.round(ms / 60_000)} minutes`;

export function planFailure(
  job: ClaimedJob,
  error: ScrapeError,
  site: string,
  random: () => number,
): FailurePlan {
  if (!willRetry(job, error)) {
    return { final: true, delay: null, message: error.userMessage(site, true), progress: null };
  }
  const delay = retryDelay(job.retryCount, error, random);
  return {
    final: false,
    delay,
    message: error.userMessage(site, false),
    progress:
      `Attempt ${job.retryCount + 1} of ${job.maxRetries + 1} failed. ` +
      `Trying again in about ${about(delay)}.`,
  };
}

/**
 * Schedules a retry with backoff, or fails the job when its retries are used up. A
 * chapter fetch that fails for good records the failure on the chapter, where the reader
 * and the chapter list show it.
 */
export async function failJob(
  db: Database,
  job: ClaimedJob,
  error: ScrapeError,
  site: string,
  random: () => number,
): Promise<FailurePlan> {
  const plan = planFailure(job, error, site, random);
  await db.withTransaction(async (tx) => {
    if (plan.final) {
      await guarded(
        tx,
        job,
        `status = 'failed', finished_at = ${NOW}, error_type = $2, error_message = $3,
         error_detail = $4, progress_message = NULL, progress_percent = NULL`,
        [error.type, plan.message, error.detail],
      );
      if (job.type === 'chapter_fetch') {
        await tx.query(
          `UPDATE chapters SET fetch_error_type = $2, fetch_error_message = $3
           WHERE id = $1 AND is_fetched = 0`,
          [job.chapterId, error.type, plan.message],
        );
      }
    } else {
      await guarded(
        tx,
        job,
        `status = 'pending', retry_count = retry_count + 1, available_at = $2,
         error_type = $3, error_message = $4, error_detail = $5,
         progress_message = $6, progress_percent = NULL`,
        [
          new Date(Date.now() + (plan.delay ?? 0)).toISOString(),
          error.type,
          plan.message,
          error.detail,
          plan.progress,
        ],
      );
    }
  });
  return plan;
}

/** Hands an unfinished job back without counting an attempt (the app is stopping). */
export async function releaseJob(db: Queryable, job: ClaimedJob): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE scrape_jobs
     SET status = 'pending', available_at = ${NOW}, progress_message = $2, progress_percent = NULL
     WHERE id = $1 AND status = 'running'`,
    [job.id, QUEUED_MESSAGE],
  );
  return rowCount > 0;
}

/**
 * Puts the jobs that were running when the app last stopped back in the queue, where
 * they start again (a whole-novel fetch carries on where it stopped). Returns how many.
 */
export async function requeueInterrupted(db: Queryable): Promise<number> {
  const { rowCount } = await db.query(
    `UPDATE scrape_jobs
     SET status = 'pending', available_at = ${NOW}, progress_message = $1, progress_percent = NULL
     WHERE status = 'running'`,
    [QUEUED_MESSAGE],
  );
  return rowCount;
}

/** What the queue has to do soon, for a platform showing that work goes on. */
export interface QueueStatus {
  running: number;
  /** Jobs whose time comes within the next 15 minutes. */
  waiting: number;
  /** The progress of the job that reported last, such as "Fetched 12 / 340 chapters". */
  message: string | null;
}

export async function queueStatus(db: Queryable): Promise<QueueStatus> {
  const { rows } = await db.query<{ running: number; waiting: number; message: string | null }>(
    `SELECT count(*) FILTER (WHERE status = 'running') AS running,
            count(*) FILTER (WHERE status = 'pending'
                             AND available_at <= ${nowPlus('+15 minutes')}) AS waiting,
            (SELECT progress_message FROM scrape_jobs
              WHERE status = 'running' AND progress_message IS NOT NULL
              ORDER BY updated_at DESC LIMIT 1) AS message
       FROM scrape_jobs
      WHERE status IN ('pending', 'running')`,
  );
  const row = rows[0];
  return { running: row?.running ?? 0, waiting: row?.waiting ?? 0, message: row?.message ?? null };
}
