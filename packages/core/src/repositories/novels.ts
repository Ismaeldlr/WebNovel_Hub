import {
  type ChapterOrder,
  type ChapterSummary,
  EPUB_SOURCE,
  type LibraryState,
  type LibraryStatus,
  type NovelDetail,
  type NovelSummary,
  type ScrapeErrorType,
  type ScrapeFailure,
} from '@webnovel-hub/shared';
import type { Queryable } from '../db/database.js';
import { bool, parseJson, searchKey } from '../db/values.js';

/** The columns NOVEL_SUMMARY_COLUMNS selects (novels `n`, source_sites `s`). */
export interface NovelSummaryRow {
  id: string;
  source: string;
  source_name: string;
  title: string;
  author: string | null;
  cover_updated_at: string | null;
  total_chapters: number;
  update_error_type: ScrapeErrorType | null;
  update_error_message: string | null;
  last_checked_at: string | null;
  latest_chapter_at: string | null;
}

/** The columns LIBRARY_STATE_COLUMNS selects (library_entries `e`, all null without one). */
export interface LibraryStateRow {
  status: LibraryStatus | null;
  is_favorite: number | null;
  notify: number | null;
  hidden: number | null;
  /** JSON array of shelf ids (an empty one without an entry). */
  shelf_ids: string;
  last_read_chapter_number: number | null;
  furthest_chapter_number: number | null;
  added_at: string | null;
  last_read_at: string | null;
  new_chapter_count: number;
}

export const NOVEL_SUMMARY_COLUMNS = `
  n.id, n.source, s.name AS source_name, n.title, n.author, n.cover_updated_at,
  n.total_chapters, n.update_error_type, n.update_error_message, n.last_checked_at,
  n.latest_chapter_at`;

export const LIBRARY_STATE_COLUMNS = `
  e.status, e.is_favorite, e.notify, e.hidden, e.last_read_chapter_number,
  e.furthest_chapter_number, e.added_at, e.last_read_at,
  (SELECT json_group_array(sn.shelf_id) FROM shelf_novels sn WHERE sn.novel_id = n.id
  ) AS shelf_ids,
  (SELECT count(*) FROM new_chapters u WHERE u.novel_id = n.id AND u.seen_at IS NULL
  ) AS new_chapter_count`;

interface NovelRow extends NovelSummaryRow, LibraryStateRow {
  source_url: string;
  description: string | null;
  tags: string;
  last_scraped_at: string | null;
  created_at: string;
  updated_at: string;
}

function failure(type: ScrapeErrorType | null, message: string | null): ScrapeFailure | null {
  return type !== null && message !== null ? { type, message } : null;
}

/** Where a novel's stored cover is served; the version makes a changed cover a new address. */
export function coverUrl(novelId: string, coverUpdatedAt: string | null): string | null {
  return coverUpdatedAt === null
    ? null
    : `/covers/${encodeURIComponent(novelId)}?v=${encodeURIComponent(coverUpdatedAt)}`;
}

export function toNovelSummary(row: NovelSummaryRow): NovelSummary {
  return {
    id: row.id,
    source: { key: row.source, name: row.source_name },
    title: row.title,
    author: row.author,
    coverUrl: coverUrl(row.id, row.cover_updated_at),
    totalChapters: row.total_chapters,
    updateFailure: failure(row.update_error_type, row.update_error_message),
    lastCheckedAt: row.last_checked_at,
    latestChapterAt: row.latest_chapter_at,
  };
}

/** The novel's library entry, or null when it has none. */
export function toLibraryState(row: LibraryStateRow): LibraryState | null {
  if (row.status === null || row.added_at === null) return null;
  return {
    status: row.status,
    isFavorite: bool(row.is_favorite),
    lastReadChapterNumber: row.last_read_chapter_number,
    furthestChapterNumber: row.furthest_chapter_number,
    newChapterCount: row.new_chapter_count,
    notify: row.notify === null ? null : bool(row.notify),
    hidden: bool(row.hidden),
    shelfIds: parseJson<string[]>(row.shelf_ids, []),
    addedAt: row.added_at,
    lastReadAt: row.last_read_at,
  };
}

function toNovel(row: NovelRow): NovelDetail {
  return {
    ...toNovelSummary(row),
    sourceUrl: row.source === EPUB_SOURCE ? null : row.source_url,
    description: row.description,
    tags: parseJson<string[]>(row.tags, []),
    lastScrapedAt: row.last_scraped_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    library: toLibraryState(row),
  };
}

/** A novel with its library state, or null. */
export async function findNovel(db: Queryable, novelId: string): Promise<NovelDetail | null> {
  const { rows } = await db.query<NovelRow>(
    `SELECT ${NOVEL_SUMMARY_COLUMNS}, n.source_url, n.description, n.tags, n.last_scraped_at,
            n.created_at, n.updated_at, ${LIBRARY_STATE_COLUMNS}
     FROM novels n
     JOIN source_sites s ON s.key = n.source
     LEFT JOIN library_entries e ON e.novel_id = n.id
     WHERE n.id = $1`,
    [novelId],
  );
  return rows[0] ? toNovel(rows[0]) : null;
}

/** A novel's summary, or null. */
export async function findNovelSummary(
  db: Queryable,
  novelId: string,
): Promise<NovelSummary | null> {
  const { rows } = await db.query<NovelSummaryRow>(
    `SELECT ${NOVEL_SUMMARY_COLUMNS}
     FROM novels n JOIN source_sites s ON s.key = n.source
     WHERE n.id = $1`,
    [novelId],
  );
  return rows[0] ? toNovelSummary(rows[0]) : null;
}

export interface CatalogMatch {
  novelId: string;
  title: string;
  inLibrary: boolean;
}

/** The novel stored under exactly this source URL. */
export async function findNovelBySourceUrl(
  db: Queryable,
  sourceUrl: string,
): Promise<CatalogMatch | null> {
  const { rows } = await db.query<{ id: string; title: string; in_library: number }>(
    `SELECT n.id, n.title,
            EXISTS (SELECT 1 FROM library_entries e WHERE e.novel_id = n.id) AS in_library
     FROM novels n WHERE n.source_url = $1`,
    [sourceUrl],
  );
  const [row] = rows;
  return row ? { novelId: row.id, title: row.title, inLibrary: bool(row.in_library) } : null;
}

interface ChapterRow {
  id: string;
  number: number;
  title: string;
  published_at: string | null;
  is_fetched: number;
  fetch_error_type: ScrapeErrorType | null;
  fetch_error_message: string | null;
  is_read: number;
  is_new: number;
}

// ORDER BY only ever comes from this allowlist, never from the request.
const CHAPTER_ORDER_SQL: Record<ChapterOrder, string> = {
  asc: 'c.number ASC',
  desc: 'c.number DESC',
};

export interface ChapterQuery {
  novelId: string;
  page: number;
  limit: number;
  order: ChapterOrder;
  /** Matches titles containing it, or the chapter number when it is a number. */
  q: string | null;
}

/** Escapes LIKE wildcards, so a search for "100%" means those characters. */
export const escapeLike = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`);

/** A LIKE pattern matching text that contains `text` anywhere. */
export const likePattern = (text: string) => `%${escapeLike(text)}%`;

/** `column` contains the LIKE pattern in placeholder `pattern`, ignoring case. */
export const contains = (column: string, pattern: string) =>
  `${column} LIKE ${pattern} ESCAPE '\\'`;

/** At most this many words of a title/author search count; the rest are ignored. */
const MAX_SEARCH_WORDS = 8;

/**
 * A title/author search: novels (`n`) whose title or author contains every word of
 * `text`, in any order. `param` adds a value to the query and returns its placeholder.
 * Null when `text` has no words.
 */
export function titleOrAuthorMatch(text: string, param: (value: unknown) => string): string | null {
  const words = [...new Set(text.toLowerCase().split(/\s+/).filter(Boolean))];
  if (words.length === 0) return null;
  return words
    .slice(0, MAX_SEARCH_WORDS)
    .map((word) => {
      const pattern = param(likePattern(searchKey(word)));
      return `(${contains('n.title_key', pattern)} OR ${contains('n.author_key', pattern)})`;
    })
    .join(' AND ');
}

/** One page of a novel's chapters with read and NEW markers, plus the total. */
export async function listChapters(
  db: Queryable,
  query: ChapterQuery,
): Promise<{ chapters: ChapterSummary[]; total: number }> {
  const pattern = query.q === null ? null : likePattern(query.q);
  const number = query.q !== null && /^\d{1,9}$/.test(query.q) ? Number(query.q) : null;
  const filter = `c.novel_id = $1 AND ($2 IS NULL OR ${contains('c.title', '$2')} OR c.number = $3)`;

  const [page, total] = await Promise.all([
    db.query<ChapterRow>(
      `SELECT c.id, c.number, c.title, c.published_at, c.is_fetched,
              c.fetch_error_type, c.fetch_error_message,
              EXISTS (SELECT 1 FROM reading_history h
                      WHERE h.novel_id = c.novel_id AND h.chapter_id = c.id) AS is_read,
              EXISTS (SELECT 1 FROM new_chapters u
                      WHERE u.chapter_id = c.id AND u.seen_at IS NULL) AS is_new
       FROM chapters c
       WHERE ${filter}
       ORDER BY ${CHAPTER_ORDER_SQL[query.order]}
       LIMIT $4 OFFSET $5`,
      [query.novelId, pattern, number, query.limit, (query.page - 1) * query.limit],
    ),
    db.query<{ total: number }>(`SELECT count(*) AS total FROM chapters c WHERE ${filter}`, [
      query.novelId,
      pattern,
      number,
    ]),
  ]);

  return {
    total: total.rows[0]?.total ?? 0,
    chapters: page.rows.map((row) => ({
      id: row.id,
      number: row.number,
      title: row.title,
      publishedAt: row.published_at,
      isFetched: bool(row.is_fetched),
      fetchFailure: failure(row.fetch_error_type, row.fetch_error_message),
      isRead: bool(row.is_read),
      isNew: bool(row.is_new),
    })),
  };
}

/** Whether a novel with this id exists. */
export async function novelExists(db: Queryable, novelId: string): Promise<boolean> {
  const { rows } = await db.query('SELECT 1 FROM novels WHERE id = $1', [novelId]);
  return rows.length > 0;
}

/** The novel's `source_sites.key`, or null when there is no such novel. */
export async function findNovelSource(db: Queryable, novelId: string): Promise<string | null> {
  const { rows } = await db.query<{ source: string }>('SELECT source FROM novels WHERE id = $1', [
    novelId,
  ]);
  return rows[0]?.source ?? null;
}
