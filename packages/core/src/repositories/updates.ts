import {
  type JobStatus,
  SCRAPE_ERROR_TYPES,
  type ScrapeErrorType,
  type UpdateRun,
  type UpdateRunError,
  type UpdateRunTrigger,
} from '@webnovel-hub/shared';
import type { Queryable } from '../db/database.js';
import { newId, parseJson } from '../db/values.js';
import { PRIORITY, QUEUED_MESSAGE } from './jobs.js';

interface UpdateRunRow {
  id: string;
  trigger: UpdateRunTrigger;
  status: JobStatus;
  novel_id: string | null;
  novel_title: string | null;
  novels_checked: number;
  new_chapters_found: number;
  errors: string;
  progress_message: string | null;
  progress_percent: number | null;
  error_type: ScrapeErrorType | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

/** The runs' columns plus the progress and failure of the job carrying each one out. */
const SELECT_RUNS = `
  SELECT r.id, r.trigger, r.status, r.novel_id, n.title AS novel_title,
         r.novels_checked, r.new_chapters_found, r.errors,
         j.progress_message, j.progress_percent, j.error_type, j.error_message,
         r.created_at, r.started_at, r.finished_at
  FROM update_job_runs r
  LEFT JOIN novels n ON n.id = r.novel_id
  LEFT JOIN scrape_jobs j ON j.id = (
    SELECT id FROM scrape_jobs WHERE update_run_id = r.id ORDER BY created_at DESC LIMIT 1)`;

const isErrorType = (value: unknown): value is ScrapeErrorType =>
  (SCRAPE_ERROR_TYPES as readonly unknown[]).includes(value);

/** Each error is stored as `{ novel_id, title, error_type, message }`. */
function toErrors(value: unknown): UpdateRunError[] {
  if (!Array.isArray(value)) return [];
  const errors: UpdateRunError[] = [];
  for (const entry of value as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { novel_id, title, error_type, message } = entry as Record<string, unknown>;
    if (typeof novel_id !== 'string' || typeof message !== 'string' || !isErrorType(error_type)) {
      continue;
    }
    errors.push({
      novelId: novel_id,
      title: typeof title === 'string' ? title : '',
      type: error_type,
      message,
    });
  }
  return errors;
}

function toUpdateRun(row: UpdateRunRow): UpdateRun {
  return {
    id: row.id,
    trigger: row.trigger,
    status: row.status,
    novel: row.novel_id === null ? null : { id: row.novel_id, title: row.novel_title ?? '' },
    novelsChecked: row.novels_checked,
    newChaptersFound: row.new_chapters_found,
    errors: toErrors(parseJson<unknown>(row.errors, [])),
    progressMessage: row.progress_message,
    progressPercent: row.progress_percent,
    error:
      row.error_type !== null && row.error_message !== null
        ? { type: row.error_type, message: row.error_message }
        : null,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

/** One run, or null. */
export async function findUpdateRun(db: Queryable, runId: string): Promise<UpdateRun | null> {
  const { rows } = await db.query<UpdateRunRow>(`${SELECT_RUNS} WHERE r.id = $1`, [runId]);
  return rows[0] ? toUpdateRun(rows[0]) : null;
}

/** The novel's most recent manual check, or null. */
export async function findLatestManualRun(
  db: Queryable,
  novelId: string,
): Promise<UpdateRun | null> {
  const { rows } = await db.query<UpdateRunRow>(
    `${SELECT_RUNS}
     WHERE r.trigger = 'manual' AND r.novel_id = $1
     ORDER BY r.created_at DESC, r.id
     LIMIT 1`,
    [novelId],
  );
  return rows[0] ? toUpdateRun(rows[0]) : null;
}

/** Every run, newest first, with their total. */
export async function listUpdateRuns(
  db: Queryable,
  request: { page: number; limit: number },
): Promise<{ items: UpdateRun[]; total: number }> {
  const [page, total] = await Promise.all([
    db.query<UpdateRunRow>(
      `${SELECT_RUNS}
       ORDER BY r.created_at DESC, r.id
       LIMIT $1 OFFSET $2`,
      [request.limit, (request.page - 1) * request.limit],
    ),
    db.query<{ total: number }>('SELECT count(*) AS total FROM update_job_runs'),
  ]);
  return { items: page.rows.map(toUpdateRun), total: total.rows[0]?.total ?? 0 };
}

/** One active manual check per novel. */
export const updateCheckDedupeKey = (novelId: string) => `update:${novelId}`;

/**
 * Queues a manual check of a novel: a `manual` run and its `manual_update_check` job
 * (priority 0), in the caller's transaction. When the novel's check is already waiting or
 * running, that one is reused and the run inserted here is removed again. Returns the id
 * of the run to follow.
 */
export async function enqueueManualUpdateCheck(
  tx: Queryable,
  check: { novelId: string; maxRetries: number },
): Promise<{ runId: string; inserted: boolean }> {
  const run = await tx.query<{ id: string }>(
    `INSERT INTO update_job_runs (trigger, novel_id) VALUES ('manual', $1) RETURNING id`,
    [check.novelId],
  );
  const runId = run.rows[0]?.id;
  if (!runId) throw new Error('inserting an update run returned no row');

  const jobId = newId();
  const job = await tx.query<{ id: string; update_run_id: string }>(
    `INSERT INTO scrape_jobs (id, type, novel_id, update_run_id, priority, dedupe_key,
                              max_retries, progress_message)
     VALUES ($1, 'manual_update_check', $2, $3, $4, $5, $6, $7)
     ON CONFLICT (dedupe_key) WHERE status IN ('pending', 'running')
     DO UPDATE SET priority = min(scrape_jobs.priority, excluded.priority)
     RETURNING id, update_run_id`,
    [
      jobId,
      check.novelId,
      runId,
      PRIORITY.userWaiting,
      updateCheckDedupeKey(check.novelId),
      check.maxRetries,
      QUEUED_MESSAGE,
    ],
  );
  const row = job.rows[0];
  if (!row) throw new Error('enqueueing an update check returned no row');
  const inserted = row.id === jobId;
  if (!inserted) {
    await tx.query('DELETE FROM update_job_runs WHERE id = $1', [runId]);
  }
  return { runId: row.update_run_id, inserted };
}
