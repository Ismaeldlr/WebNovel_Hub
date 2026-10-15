import {
  LIBRARY_STATUSES,
  type LibraryItem,
  type LibrarySort,
  type LibraryStats,
  type LibraryStatus,
  type LibraryTag,
  type NovelNotifyChoice,
} from '@webnovel-hub/shared';
import type { Queryable } from '../db/database.js';
import { queryValues } from '../db/query-values.js';
import { bool, parseJson } from '../db/values.js';
import {
  LIBRARY_STATE_COLUMNS,
  type LibraryStateRow,
  NOVEL_SUMMARY_COLUMNS,
  type NovelSummaryRow,
  titleOrAuthorMatch,
  toLibraryState,
  toNovelSummary,
} from './novels.js';

type LibraryItemRow = NovelSummaryRow & LibraryStateRow;

const FROM_ENTRIES = `
  FROM library_entries e
  JOIN novels n ON n.id = e.novel_id
  JOIN source_sites s ON s.key = n.source`;

function toItem(row: LibraryItemRow): LibraryItem {
  const library = toLibraryState(row);
  // The inner join on library_entries guarantees an entry.
  if (!library) throw new Error('library row without a library entry');
  return { novel: toNovelSummary(row), library };
}

/** The library list's filters; null means "don't filter on it". */
export interface LibraryFilters {
  status: LibraryStatus | null;
  source: string | null;
  favorite: boolean | null;
  unread: boolean | null;
  tag: string | null;
  q: string | null;
}

export interface LibraryListQuery extends LibraryFilters {
  sort: LibrarySort;
  page: number;
  limit: number;
}

// ORDER BY only ever comes from this allowlist, never from the request. Every order ends
// with the title and id, so pages never overlap or skip a novel.
const LIBRARY_SORT_SQL: Record<LibrarySort, string> = {
  last_read: 'coalesce(e.last_read_at, e.added_at) DESC',
  last_updated: 'n.latest_chapter_at DESC NULLS LAST',
  title: 'n.title_key ASC',
  added: 'e.added_at DESC',
  progress: `CASE WHEN n.total_chapters > 0
                  THEN min(coalesce(e.furthest_chapter_number, 0), n.total_chapters) * 1.0
                       / n.total_chapters
                  ELSE 0 END DESC`,
};

const HAS_UNREAD_NEW = `EXISTS (
  SELECT 1 FROM new_chapters u WHERE u.novel_id = e.novel_id AND u.seen_at IS NULL)`;

/** The WHERE clause for library entries (`e`, with novels `n`) matching the filters. */
export function libraryFilterSql(filters: LibraryFilters): { where: string; values: unknown[] } {
  const { values, param } = queryValues();
  const conditions = ['1 = 1'];
  if (filters.status !== null) conditions.push(`e.status = ${param(filters.status)}`);
  if (filters.source !== null) conditions.push(`n.source = ${param(filters.source)}`);
  if (filters.favorite !== null) conditions.push(`e.is_favorite = ${param(filters.favorite)}`);
  if (filters.unread !== null) {
    conditions.push(filters.unread ? HAS_UNREAD_NEW : `NOT ${HAS_UNREAD_NEW}`);
  }
  if (filters.tag !== null) {
    conditions.push(
      `EXISTS (SELECT 1 FROM json_each(n.tags) t WHERE t.value = ${param(filters.tag)} COLLATE NOCASE)`,
    );
  }
  const search = titleOrAuthorMatch(filters.q ?? '', param);
  if (search !== null) conditions.push(search);
  return { where: conditions.join(' AND '), values };
}

/** A page of the library matching the filters, in the chosen order. */
export async function listLibrary(
  db: Queryable,
  query: LibraryListQuery,
): Promise<{ items: LibraryItem[]; total: number }> {
  const { where, values } = libraryFilterSql(query);
  const paged = queryValues(values);
  const limit = paged.param(query.limit);
  const offset = paged.param((query.page - 1) * query.limit);
  const [items, total] = await Promise.all([
    db.query<LibraryItemRow>(
      `SELECT ${NOVEL_SUMMARY_COLUMNS}, ${LIBRARY_STATE_COLUMNS}
       ${FROM_ENTRIES}
       WHERE ${where}
       ORDER BY ${LIBRARY_SORT_SQL[query.sort]}, n.title, n.id
       LIMIT ${limit} OFFSET ${offset}`,
      paged.values,
    ),
    db.query<{ total: number }>(`SELECT count(*) AS total ${FROM_ENTRIES} WHERE ${where}`, values),
  ]);
  return { items: items.rows.map(toItem), total: total.rows[0]?.total ?? 0 };
}

/**
 * Every tag of the novels in the library, A to Z. Spellings that differ only in case are one
 * tag, shown in the first of them ("Action" before "action").
 */
export async function listLibraryTags(db: Queryable): Promise<LibraryTag[]> {
  const { rows } = await db.query<{ tag: string; novels: number }>(
    `SELECT min(t.value) AS tag, count(DISTINCT e.novel_id) AS novels
     FROM library_entries e
     JOIN novels n ON n.id = e.novel_id
     JOIN json_each(n.tags) t
     GROUP BY t.value COLLATE NOCASE
     ORDER BY tag COLLATE NOCASE`,
  );
  return rows;
}

/** One novel of the library, or null when it isn't there. */
export async function findLibraryItem(db: Queryable, novelId: string): Promise<LibraryItem | null> {
  const { rows } = await db.query<LibraryItemRow>(
    `SELECT ${NOVEL_SUMMARY_COLUMNS}, ${LIBRARY_STATE_COLUMNS}
     ${FROM_ENTRIES}
     WHERE e.novel_id = $1`,
    [novelId],
  );
  return rows[0] ? toItem(rows[0]) : null;
}

/** Adds the novel (status `reading`). False when it was already there. */
export async function insertLibraryEntry(db: Queryable, novelId: string): Promise<boolean> {
  const { rowCount } = await db.query(
    `INSERT INTO library_entries (novel_id) VALUES ($1) ON CONFLICT (novel_id) DO NOTHING`,
    [novelId],
  );
  return rowCount === 1;
}

export async function updateLibraryEntry(
  db: Queryable,
  novelId: string,
  change: { status: LibraryStatus } | { isFavorite: boolean } | { notify: boolean | null },
): Promise<boolean> {
  const [column, value] =
    'status' in change
      ? ['status', change.status]
      : 'isFavorite' in change
        ? ['is_favorite', change.isFavorite]
        : ['notify', change.notify];
  const { rowCount } = await db.query(
    `UPDATE library_entries SET ${column} = $2 WHERE novel_id = $1`,
    [novelId, value],
  );
  return rowCount === 1;
}

interface StatsRow {
  total: number;
  favorites: number;
  new_chapters: number;
  novels_with_new_chapters: number;
  last_checked_at: string | null;
  by_status: string | null;
}

export async function libraryStats(db: Queryable): Promise<LibraryStats> {
  const { rows } = await db.query<StatsRow>(
    `WITH entries AS (
       SELECT e.novel_id, e.status, e.is_favorite, n.last_checked_at,
              (SELECT count(*) FROM new_chapters u
               WHERE u.novel_id = e.novel_id AND u.seen_at IS NULL) AS new_chapters
       FROM library_entries e JOIN novels n ON n.id = e.novel_id
     )
     SELECT count(*) AS total,
            count(*) FILTER (WHERE is_favorite = 1) AS favorites,
            coalesce(sum(new_chapters), 0) AS new_chapters,
            count(*) FILTER (WHERE new_chapters > 0) AS novels_with_new_chapters,
            max(last_checked_at) AS last_checked_at,
            (SELECT json_group_object(status, n) FROM
               (SELECT status, count(*) AS n FROM entries GROUP BY status)
            ) AS by_status
     FROM entries`,
  );
  const row = rows[0];
  const counts = parseJson<Record<string, number>>(row?.by_status, {});
  const byStatus = Object.fromEntries(
    LIBRARY_STATUSES.map((status) => [status, counts[status] ?? 0]),
  ) as Record<LibraryStatus, number>;
  return {
    total: row?.total ?? 0,
    byStatus,
    favorites: row?.favorites ?? 0,
    newChapters: row?.new_chapters ?? 0,
    novelsWithNewChapters: row?.novels_with_new_chapters ?? 0,
    lastCheckedAt: row?.last_checked_at ?? null,
  };
}

/** Unread NEW chapters of novels in the library. */
export async function newChaptersCount(db: Queryable): Promise<number> {
  const { rows } = await db.query<{ count: number }>(
    `SELECT count(*) AS count
     FROM new_chapters u
     JOIN library_entries e ON e.novel_id = u.novel_id
     WHERE u.seen_at IS NULL`,
  );
  return rows[0]?.count ?? 0;
}

/** The novels that made their own choice about notifications, by title. */
export async function listNotifyChoices(db: Queryable): Promise<NovelNotifyChoice[]> {
  const { rows } = await db.query<{ id: string; title: string; notify: number }>(
    `SELECT n.id, n.title, e.notify
     FROM library_entries e JOIN novels n ON n.id = e.novel_id
     WHERE e.notify IS NOT NULL
     ORDER BY n.title COLLATE NOCASE`,
  );
  return rows.map((row) => ({ novelId: row.id, title: row.title, notify: bool(row.notify) }));
}
