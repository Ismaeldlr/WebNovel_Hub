import type {
  IngestionJob,
  IngestionResult,
  Job,
  JobStatus,
  JobType,
  ScrapeErrorType,
  ScrapeFailure,
} from '@webnovel-hub/shared';
import type { Queryable } from '../db/database.js';
import { newId, parseJson } from '../db/values.js';

/** Job priorities: lower runs first. */
export const PRIORITY = { userWaiting: 0, prefetch: 5 } as const;

/** Shown for a queued job until it starts. */
export const QUEUED_MESSAGE = 'Waiting to start…';

interface JobRow {
  id: string;
  type: JobType;
  status: JobStatus;
  novel_id: string | null;
  chapter_id: string | null;
  payload: string;
  result: string | null;
  progress_message: string | null;
  progress_percent: number | null;
  error_type: ScrapeErrorType | null;
  error_message: string | null;
  retry_count: number;
  max_retries: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
  source_key: string | null;
  source_name: string | null;
}

// Everything the reader may see. error_detail and the dedupe key are internal.
const SELECT_JOB = `
  SELECT j.id, j.type, j.status, j.novel_id, j.chapter_id, j.payload, j.result,
         j.progress_message, j.progress_percent, j.error_type, j.error_message,
         j.retry_count, j.max_retries, j.created_at, j.started_at, j.finished_at, j.updated_at,
         s.key AS source_key, s.name AS source_name
  FROM scrape_jobs j
  LEFT JOIN source_sites s ON s.key = j.payload ->> 'source'`;

const text = (value: unknown) => (typeof value === 'string' ? value : null);
const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

function required(value: string | null, column: string): string {
  // The scrape_jobs_refs_match_type CHECK guarantees these for each job type.
  if (value === null) throw new Error(`scrape_jobs.${column} is unexpectedly NULL`);
  return value;
}

function failure(row: JobRow): ScrapeFailure | null {
  return row.error_type !== null && row.error_message !== null
    ? { type: row.error_type, message: row.error_message }
    : null;
}

// Job results are stored in snake_case.
function ingestionResult(result: Record<string, unknown> | null): IngestionResult | null {
  const novelId = text(result?.novel_id);
  if (!result || novelId === null) return null;
  return {
    novelId,
    title: text(result.title) ?? '',
    chapterCount: count(result.chapter_count),
    duplicate: result.duplicate === true,
  };
}

function toJob(row: JobRow): Job {
  const fields = {
    id: row.id,
    status: row.status,
    progressMessage: row.progress_message,
    progressPercent: row.progress_percent,
    error: failure(row),
    retryCount: row.retry_count,
    maxRetries: row.max_retries,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    updatedAt: row.updated_at,
  };
  const payload = parseJson<Record<string, unknown>>(row.payload, {});
  const result = parseJson<Record<string, unknown> | null>(row.result, null);
  switch (row.type) {
    case 'novel_ingestion':
      return {
        ...fields,
        type: row.type,
        url: text(payload.url),
        source:
          row.source_key !== null && row.source_name !== null
            ? { key: row.source_key, name: row.source_name }
            : null,
        result: ingestionResult(result),
      };
    case 'chapter_fetch':
      return {
        ...fields,
        type: row.type,
        novelId: required(row.novel_id, 'novel_id'),
        chapterId: required(row.chapter_id, 'chapter_id'),
        result: result && { wordCount: count(result.word_count) },
      };
    case 'update_check':
      return {
        ...fields,
        type: row.type,
        result: result && {
          novelsChecked: count(result.novels_checked),
          newChapters: count(result.new_chapters),
        },
      };
    case 'manual_update_check':
      return {
        ...fields,
        type: row.type,
        novelId: required(row.novel_id, 'novel_id'),
        result: result && { newChapters: count(result.new_chapters) },
      };
    case 'novel_fetch_all':
      return {
        ...fields,
        type: row.type,
        novelId: required(row.novel_id, 'novel_id'),
        result: result && { fetched: count(result.fetched), failed: count(result.failed) },
      };
  }
}

/** A job, or null. */
export async function findJob(db: Queryable, jobId: string): Promise<Job | null> {
  const { rows } = await db.query<JobRow>(`${SELECT_JOB} WHERE j.id = $1`, [jobId]);
  return rows[0] ? toJob(rows[0]) : null;
}

/** The URL imports, newest first. */
export async function listRecentImports(db: Queryable, limit: number): Promise<IngestionJob[]> {
  const { rows } = await db.query<JobRow & { type: 'novel_ingestion' }>(
    `${SELECT_JOB}
     WHERE j.type = 'novel_ingestion'
     ORDER BY j.created_at DESC, j.id
     LIMIT $1`,
    [limit],
  );
  return rows.map((row) => toJob(row) as IngestionJob);
}

export interface Enqueued {
  id: string;
  /** False when an active job with the same dedupe key was reused. */
  inserted: boolean;
}

/** Queues a `novel_ingestion` job, or reuses the active job for the same URL. */
export async function enqueueIngestion(
  db: Queryable,
  job: { url: string; source: string; maxRetries: number },
): Promise<Enqueued> {
  const id = newId();
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO scrape_jobs (id, type, payload, priority, dedupe_key, max_retries,
                              progress_message)
     VALUES ($1, 'novel_ingestion', $2, $3, $4, $5, $6)
     ON CONFLICT (dedupe_key) WHERE status IN ('pending', 'running')
     DO UPDATE SET priority = min(scrape_jobs.priority, excluded.priority)
     RETURNING id`,
    [
      id,
      { url: job.url, source: job.source },
      PRIORITY.userWaiting,
      ingestionDedupeKey(job.url),
      job.maxRetries,
      QUEUED_MESSAGE,
    ],
  );
  const [row] = rows;
  if (!row) throw new Error('enqueueing an ingestion returned no row');
  return { id: row.id, inserted: row.id === id };
}

/** One active import per URL; importing a novel already here reports it as a duplicate. */
export function ingestionDedupeKey(url: string): string {
  return `ingest:${url}`;
}

/**
 * Queues background fetches (priority 5) for up to `count` chapters numbered from
 * `fromNumber`: those not fetched yet, not failed, and with a source to fetch from.
 * Chapters that already have an active job are skipped. Returns how many were queued.
 */
export async function enqueuePrefetch(
  db: Queryable,
  prefetch: { novelId: string; fromNumber: number; count: number; maxRetries: number },
): Promise<number> {
  const { rowCount } = await db.query(
    `INSERT INTO scrape_jobs (type, novel_id, chapter_id, priority, dedupe_key, max_retries,
                              progress_message)
     SELECT 'chapter_fetch', c.novel_id, c.id, $4, 'chapter:' || c.id, $5, $6
     FROM chapters c
     WHERE c.novel_id = $1
       AND c.number >= $2 AND c.number < $2 + $3
       AND c.is_fetched = 0 AND c.fetch_error_type IS NULL AND c.source_url IS NOT NULL
     ORDER BY c.number
     ON CONFLICT (dedupe_key) WHERE status IN ('pending', 'running') DO NOTHING`,
    [
      prefetch.novelId,
      prefetch.fromNumber,
      prefetch.count,
      PRIORITY.prefetch,
      prefetch.maxRetries,
      QUEUED_MESSAGE,
    ],
  );
  return rowCount;
}

/** A chapter's pending or running `chapter_fetch` job, as the reader shows it. */
export interface ChapterFetchJobState {
  id: string;
  status: JobStatus;
  progressMessage: string | null;
  error: ScrapeFailure | null;
}

type ChapterJobRow = Pick<
  JobRow,
  'id' | 'status' | 'progress_message' | 'error_type' | 'error_message'
>;

const toChapterJob = (row: ChapterJobRow): ChapterFetchJobState => ({
  id: row.id,
  status: row.status,
  progressMessage: row.progress_message,
  error:
    row.error_type !== null && row.error_message !== null
      ? { type: row.error_type, message: row.error_message }
      : null,
});

/** One active fetch per chapter (the partial unique index on dedupe_key). */
export const chapterDedupeKey = (chapterId: string) => `chapter:${chapterId}`;

/** The chapter's active fetch job, or null. */
export async function findActiveChapterJob(
  db: Queryable,
  chapterId: string,
): Promise<ChapterFetchJobState | null> {
  const { rows } = await db.query<ChapterJobRow>(
    `SELECT id, status, progress_message, error_type, error_message
     FROM scrape_jobs
     WHERE dedupe_key = $1 AND status IN ('pending', 'running')`,
    [chapterDedupeKey(chapterId)],
  );
  return rows[0] ? toChapterJob(rows[0]) : null;
}

/**
 * Ensures a `chapter_fetch` job exists for a chapter the reader is waiting for
 * (priority 0). The chapter's active job, e.g. a queued prefetch, is reused and raised
 * to priority 0.
 */
export async function enqueueChapterFetch(
  db: Queryable,
  job: { novelId: string; chapterId: string; maxRetries: number },
): Promise<ChapterFetchJobState> {
  const { rows } = await db.query<ChapterJobRow>(
    `INSERT INTO scrape_jobs (type, novel_id, chapter_id, priority, dedupe_key, max_retries,
                              progress_message)
     VALUES ('chapter_fetch', $1, $2, $3, $4, $5, $6)
     ON CONFLICT (dedupe_key) WHERE status IN ('pending', 'running')
     DO UPDATE SET priority = min(scrape_jobs.priority, excluded.priority)
     RETURNING id, status, progress_message, error_type, error_message`,
    [
      job.novelId,
      job.chapterId,
      PRIORITY.userWaiting,
      chapterDedupeKey(job.chapterId),
      job.maxRetries,
      QUEUED_MESSAGE,
    ],
  );
  const [row] = rows;
  if (!row) throw new Error('enqueueing a chapter fetch returned no row');
  return toChapterJob(row);
}
