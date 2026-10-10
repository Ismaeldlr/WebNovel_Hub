// Scheduled update checks. A run is due when none was created in the last interval and
// none is waiting or running; after the app was closed for days, one run is created, not
// one per missed interval. A run is an `update_job_runs` row and its `update_check` job,
// created together.
import type { Database } from '../db/database.js';
import { QUEUED_MESSAGE } from '../repositories/jobs.js';

/** At most one scheduled check waits or runs at a time. */
const SCHEDULED_DEDUPE_KEY = 'update:scheduled';
/** Below every job the reader is waiting for, and below prefetch. */
const SCHEDULED_PRIORITY = 9;

/** Creates the scheduled run when one is due; resolves to its job's id, or null. */
export async function scheduleDueRun(
  db: Database,
  options: { intervalHours: number; maxRetries: number; now?: Date },
): Promise<string | null> {
  const since = new Date((options.now ?? new Date()).getTime() - options.intervalHours * 3_600_000);
  return db.withTransaction(async (tx) => {
    const { rows } = await tx.query<{ due: number }>(
      `SELECT NOT EXISTS (SELECT 1 FROM update_job_runs
                          WHERE trigger = 'scheduled' AND created_at > $1)
          AND NOT EXISTS (SELECT 1 FROM scrape_jobs
                          WHERE dedupe_key = $2 AND status IN ('pending', 'running')) AS due`,
      [since.toISOString(), SCHEDULED_DEDUPE_KEY],
    );
    if (!rows[0]?.due) return null;
    const run = await tx.query<{ id: string }>(
      `INSERT INTO update_job_runs (trigger) VALUES ('scheduled') RETURNING id`,
    );
    const job = await tx.query<{ id: string }>(
      `INSERT INTO scrape_jobs (type, update_run_id, priority, dedupe_key, max_retries,
                                progress_message)
       VALUES ('update_check', $1, $2, $3, $4, $5)
       RETURNING id`,
      [
        run.rows[0]!.id,
        SCHEDULED_PRIORITY,
        SCHEDULED_DEDUPE_KEY,
        options.maxRetries,
        QUEUED_MESSAGE,
      ],
    );
    return job.rows[0]!.id;
  });
}
