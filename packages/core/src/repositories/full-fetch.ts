import type {
  ExportItem,
  FullFetch,
  FullFetchResult,
  JobStatus,
  ScrapeErrorType,
} from '@webnovel-hub/shared';
import type { Queryable } from '../db/database.js';
import { parseJson } from '../db/values.js';
import { QUEUED_MESSAGE } from './jobs.js';
import { NOVEL_SUMMARY_COLUMNS, type NovelSummaryRow, toNovelSummary } from './novels.js';

/** One active whole-novel fetch per novel. */
export const fullFetchDedupeKey = (novelId: string) => `fetch-all:${novelId}`;

/**
 * The lowest priority. Whole-novel fetches run in a lane of their own, so priority never
 * puts them before or after other jobs; each site's queue is first come, first served.
 */
const FULL_FETCH_PRIORITY = 9;

interface FullFetchRow {
  id: string;
  status: JobStatus;
  result: string | null;
  progress_message: string | null;
  progress_percent: number | null;
  error_type: ScrapeErrorType | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  queued_behind: number;
}

const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

function toFullFetch(row: FullFetchRow): FullFetch {
  const stored = parseJson<Record<string, unknown> | null>(row.result, null);
  const result: FullFetchResult | null = stored && {
    fetched: count(stored.fetched),
    failed: count(stored.failed),
  };
  const active = row.status === 'pending' || row.status === 'running';
  return {
    id: row.id,
    status: row.status,
    progressMessage: row.progress_message,
    progressPercent: row.progress_percent,
    queuedBehind: row.status === 'pending' ? row.queued_behind : 0,
    error:
      row.error_type !== null && row.error_message !== null
        ? { type: row.error_type, message: row.error_message }
        : null,
    canCancel: active,
    result,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

/**
 * A whole-novel fetch job `j` as FullFetchRow columns. `queued_behind` counts the fetches
 * of the same site that go first: the running one and those asked for earlier.
 */
const FULL_FETCH_COLUMNS = `
  j.id, j.status, j.result, j.progress_message, j.progress_percent,
  j.error_type, j.error_message, j.created_at, j.started_at, j.finished_at,
  (SELECT count(*) FROM scrape_jobs a
   WHERE a.type = 'novel_fetch_all' AND a.status IN ('pending', 'running')
     AND a.payload ->> 'source' = j.payload ->> 'source' AND a.id <> j.id
     AND (a.status = 'running' OR (a.created_at, a.id) < (j.created_at, j.id))
  ) AS queued_behind`;

/** The id of novel `n`'s latest whole-novel fetch. */
const LATEST_FULL_FETCH_ID = `(
  SELECT id FROM scrape_jobs
  WHERE type = 'novel_fetch_all' AND novel_id = n.id
  ORDER BY created_at DESC, id DESC LIMIT 1)`;

/** The novel's latest whole-novel fetch. */
export async function findLatestFullFetch(
  db: Queryable,
  novelId: string,
): Promise<FullFetch | null> {
  const { rows } = await db.query<FullFetchRow>(
    `SELECT ${FULL_FETCH_COLUMNS}
     FROM novels n JOIN scrape_jobs j ON j.id = ${LATEST_FULL_FETCH_ID}
     WHERE n.id = $1`,
    [novelId],
  );
  const row = rows[0];
  return row ? toFullFetch(row) : null;
}

/** The most novels the Exports page lists. */
export const EXPORT_LIST_LIMIT = 100;

interface RequestedRow extends NovelSummaryRow, FullFetchRow {
  stored_count: number;
  chapter_count: number;
}

/**
 * The novels asked to be fetched in full, most recently asked first (the Exports page),
 * each with its latest fetch and its stored chapters. A fetch that was stopped is
 * deleted, so a novel whose only fetch was stopped drops out.
 */
export async function listRequestedFullFetches(db: Queryable): Promise<ExportItem[]> {
  const { rows } = await db.query<RequestedRow>(
    `WITH asked AS (
       SELECT novel_id, max(created_at) AS asked_at FROM scrape_jobs
       WHERE type = 'novel_fetch_all'
       GROUP BY novel_id
     )
     SELECT ${NOVEL_SUMMARY_COLUMNS},
            (SELECT count(*) FROM chapters c WHERE c.novel_id = n.id AND c.is_fetched = 1)
              AS stored_count,
            (SELECT count(*) FROM chapters c WHERE c.novel_id = n.id) AS chapter_count,
            ${FULL_FETCH_COLUMNS}
     FROM asked
     JOIN novels n ON n.id = asked.novel_id
     JOIN source_sites s ON s.key = n.source
     JOIN scrape_jobs j ON j.id = ${LATEST_FULL_FETCH_ID}
     ORDER BY asked.asked_at DESC, n.id
     LIMIT ${EXPORT_LIST_LIMIT}`,
  );
  return rows.map((row) => ({
    novel: toNovelSummary(row),
    fetch: toFullFetch(row),
    storedChapters: row.stored_count,
    totalChapters: row.chapter_count,
  }));
}

/** Chapters of the novel whose text is stored, and all of them. */
export async function countStoredChapters(
  db: Queryable,
  novelId: string,
): Promise<{ stored: number; total: number }> {
  const { rows } = await db.query<{ stored: number; total: number }>(
    `SELECT count(*) FILTER (WHERE is_fetched = 1) AS stored, count(*) AS total
     FROM chapters WHERE novel_id = $1`,
    [novelId],
  );
  return rows[0] ?? { stored: 0, total: 0 };
}

/**
 * Queues a fetch of every chapter of the novel that isn't stored. When the novel's fetch
 * is already waiting or running, that one stays and nothing is added.
 */
export async function enqueueFullFetch(
  db: Queryable,
  request: { novelId: string; source: string; maxRetries: number },
): Promise<void> {
  await db.query(
    `INSERT INTO scrape_jobs (type, novel_id, priority, dedupe_key, payload, max_retries,
                              progress_message)
     VALUES ('novel_fetch_all', $1, $2, $3, json_object('source', $4), $5, $6)
     ON CONFLICT (dedupe_key) WHERE status IN ('pending', 'running') DO NOTHING`,
    [
      request.novelId,
      FULL_FETCH_PRIORITY,
      fullFetchDedupeKey(request.novelId),
      request.source,
      request.maxRetries,
      QUEUED_MESSAGE,
    ],
  );
}

/**
 * Stops the novel's waiting or running fetch by removing its job: the runner finds the
 * job gone and stops before the next chapter. Chapters already stored stay.
 */
export async function cancelFullFetch(
  db: Queryable,
  novelId: string,
): Promise<'cancelled' | 'none'> {
  const deleted = await db.query(
    `DELETE FROM scrape_jobs
     WHERE type = 'novel_fetch_all' AND novel_id = $1 AND status IN ('pending', 'running')`,
    [novelId],
  );
  return deleted.rowCount > 0 ? 'cancelled' : 'none';
}
