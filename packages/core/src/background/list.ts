import { EPUB_SOURCE } from '@webnovel-hub/shared';
import type { Queryable } from '../db/database.js';
import { CHECKED_ENTRIES, wantsNewChapters } from '../repositories/notifications.js';
import { findPreferences } from '../repositories/preferences.js';
import { noticeStyle } from '../jobs/notice.js';
import type { CheckList } from './checks.js';

/**
 * What a background task checks while the app is closed: the novels a scheduled check
 * covers (Reading and Following, and novels the reader wants to be told about), stalest
 * first, with how many chapters the app has and whether their new chapters are announced.
 */
export async function buildCheckList(db: Queryable): Promise<CheckList> {
  const preferences = await findPreferences(db);
  const { rows } = await db.query<Omit<CheckList['novels'][number], 'notify'> & { notify: number }>(
    `SELECT n.id, n.title, n.source_url AS url,
            (SELECT count(*) FROM chapters c WHERE c.novel_id = n.id) AS chapters,
            ${wantsNewChapters('$2')} AS notify
     FROM novels n JOIN library_entries e ON e.novel_id = n.id
     WHERE n.source <> $1 AND ${CHECKED_ENTRIES}
     ORDER BY n.last_checked_at NULLS FIRST, n.created_at`,
    [EPUB_SOURCE, preferences.notifyNovels],
  );
  const novels = rows.map((novel) => ({ ...novel, notify: novel.notify === 1 }));
  const { rows: runs } = await db.query<{ last: string | null }>(
    `SELECT max(created_at) AS last FROM update_job_runs WHERE trigger = 'scheduled'`,
  );
  return {
    enabled: preferences.backgroundFetching,
    notify: preferences.notifyNewChapters,
    style: noticeStyle(preferences),
    intervalHours: preferences.updateIntervalHours,
    lastCheckedAt: runs[0]?.last ?? null,
    novels,
  };
}
