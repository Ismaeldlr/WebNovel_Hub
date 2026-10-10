import { EPUB_SOURCE } from '@webnovel-hub/shared';
import type { Queryable } from '../db/database.js';
import { findPreferences } from '../repositories/preferences.js';
import type { CheckList } from './checks.js';

/**
 * What a background task checks while the app is closed: the novels a scheduled check
 * covers (Reading and Following), stalest first, with how many chapters the app has.
 */
export async function buildCheckList(db: Queryable): Promise<CheckList> {
  const preferences = await findPreferences(db);
  const { rows: novels } = await db.query<CheckList['novels'][number]>(
    `SELECT n.id, n.title, n.source_url AS url,
            (SELECT count(*) FROM chapters c WHERE c.novel_id = n.id) AS chapters
     FROM novels n JOIN library_entries e ON e.novel_id = n.id
     WHERE n.source <> $1 AND e.status IN ('reading', 'following')
     ORDER BY n.last_checked_at NULLS FIRST, n.created_at`,
    [EPUB_SOURCE],
  );
  const { rows } = await db.query<{ last: string | null }>(
    `SELECT max(created_at) AS last FROM update_job_runs WHERE trigger = 'scheduled'`,
  );
  return {
    enabled: preferences.backgroundFetching,
    notify: preferences.notifyNewChapters,
    intervalHours: preferences.updateIntervalHours,
    lastCheckedAt: rows[0]?.last ?? null,
    novels,
  };
}
