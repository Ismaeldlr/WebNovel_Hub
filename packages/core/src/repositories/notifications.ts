import type { NotifyNovels } from '@webnovel-hub/shared';
import type { Queryable } from '../db/database.js';

/**
 * The library entries (`e`) a scheduled check covers: the novels being read or followed,
 * and any novel the reader asked to be told about.
 */
export const CHECKED_ENTRIES = `(e.status IN ('reading', 'following') OR e.notify = 1)`;

/**
 * Whether the entry `e` wants its new chapters announced: its own choice, else whether
 * `novels` (an SQL parameter holding the notify_novels preference) takes in its status.
 */
export const wantsNewChapters = (novels: string) =>
  `coalesce(e.notify, ${novels} = 'following' AND e.status IN ('reading', 'following'))`;

/** Of the novels `ids`, those whose new chapters are announced. */
export async function novelsToAnnounce(
  db: Queryable,
  ids: string[],
  novels: NotifyNovels,
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { rows } = await db.query<{ novel_id: string }>(
    `SELECT e.novel_id FROM library_entries e
     WHERE e.novel_id IN (SELECT value FROM json_each($1)) AND ${wantsNewChapters('$2')}`,
    [ids, novels],
  );
  return new Set(rows.map((row) => row.novel_id));
}

/** The NEW chapters of each novel that the reader hasn't opened yet. */
export async function unseenNewChapters(
  db: Queryable,
  ids: string[],
): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const { rows } = await db.query<{ novel_id: string; count: number }>(
    `SELECT novel_id, count(*) AS count FROM new_chapters
     WHERE seen_at IS NULL AND novel_id IN (SELECT value FROM json_each($1))
     GROUP BY novel_id`,
    [ids],
  );
  return new Map(rows.map((row) => [row.novel_id, row.count]));
}
