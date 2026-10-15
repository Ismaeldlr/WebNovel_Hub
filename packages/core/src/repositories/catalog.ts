import type { SearchResult } from '@webnovel-hub/shared';
import type { Queryable } from '../db/database.js';
import { queryValues } from '../db/query-values.js';
import { searchKey } from '../db/values.js';
import {
  NOVEL_SUMMARY_COLUMNS,
  type NovelSummaryRow,
  contains,
  escapeLike,
  titleOrAuthorMatch,
  toNovelSummary,
} from './novels.js';

// Hidden novels stay out of the search, as out of the library's lists.
const FROM_NOVELS = `
  FROM novels n
  JOIN source_sites s ON s.key = n.source
  LEFT JOIN library_entries e ON e.novel_id = n.id`;
const SHOWN = 'coalesce(e.hidden, 0) = 0';

/**
 * The global search: at most `limit` novels whose title or author contains every word of
 * `q`, best first: the title equal to `q`, then titles starting with it, then titles
 * containing it, then the other matches (e.g. by author); ties by title. Also counts
 * every match.
 */
export async function searchCatalog(
  db: Queryable,
  query: { q: string; limit: number },
): Promise<{ results: SearchResult[]; total: number }> {
  const { values, param } = queryValues();
  const where = `${SHOWN} AND ${titleOrAuthorMatch(query.q, param) ?? '1 = 1'}`;
  const counted = [...values];
  const phrase = escapeLike(searchKey(query.q));
  const exact = param(phrase);
  const prefix = param(`${phrase}%`);
  const anywhere = param(`%${phrase}%`);
  const limit = param(query.limit);

  const [results, total] = await Promise.all([
    db.query<NovelSummaryRow>(
      `SELECT ${NOVEL_SUMMARY_COLUMNS}
       ${FROM_NOVELS}
       WHERE ${where}
       ORDER BY CASE WHEN ${contains('n.title_key', exact)} THEN 0
                     WHEN ${contains('n.title_key', prefix)} THEN 1
                     WHEN ${contains('n.title_key', anywhere)} THEN 2
                     ELSE 3 END,
                n.title_key, n.id
       LIMIT ${limit}`,
      values,
    ),
    db.query<{ total: number }>(`SELECT count(*) AS total ${FROM_NOVELS} WHERE ${where}`, counted),
  ]);

  return {
    total: total.rows[0]?.total ?? 0,
    results: results.rows.map((row) => ({ novel: toNovelSummary(row), inLibrary: true })),
  };
}
