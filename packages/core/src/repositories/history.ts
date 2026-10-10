import type {
  HistoryEntry,
  HistoryNovelItem,
  HistoryNovelsResponse,
  HistoryRange,
  HistoryStats,
} from '@webnovel-hub/shared';
import type { Queryable } from '../db/database.js';
import { queryValues } from '../db/query-values.js';
import { addDays, bool, localDay } from '../db/values.js';
import {
  NOVEL_SUMMARY_COLUMNS,
  type NovelSummaryRow,
  coverUrl,
  titleOrAuthorMatch,
  toNovelSummary,
} from './novels.js';

// Days in each range, today included; the SQL text comes only from this map.
const RANGE_DAYS: Record<HistoryRange, number | null> = { all: null, '7d': 7, '30d': 30 };

export interface HistoryFilter {
  range: HistoryRange;
  /** Only this novel's reads. */
  novelId: string | null;
  /** The reader's local date today (YYYY-MM-DD); ranges count back from it. */
  today?: string;
}

/**
 * The WHERE clause over `reading_history h` for a filter. "7 days" is today and the six
 * days before it, by the local dates the reads were recorded with.
 */
function historyWhere(filter: HistoryFilter, param: (value: unknown) => string): string {
  const conditions = ['1 = 1'];
  const days = RANGE_DAYS[filter.range];
  if (days !== null) {
    const from = addDays(filter.today ?? localDay(), -(days - 1));
    conditions.push(`h.read_day >= ${param(from)}`);
  }
  if (filter.novelId !== null) conditions.push(`h.novel_id = ${param(filter.novelId)}`);
  return conditions.join(' AND ');
}

/** Where a page of history ends: the last entry's read time and id. */
export interface HistoryCursor {
  readAt: string;
  id: number;
}

const CURSOR = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)_(\d{1,15})$/;

export function parseCursor(text: string): HistoryCursor | null {
  const match = CURSOR.exec(text);
  return match?.[1] && match[2] ? { readAt: match[1], id: Number(match[2]) } : null;
}

const formatCursor = (cursor: HistoryCursor) => `${cursor.readAt}_${cursor.id}`;

interface EntryRow {
  id: number;
  read_at: string;
  date: string;
  novel_id: string;
  title: string;
  author: string | null;
  cover_updated_at: string | null;
  number: number;
  chapter_title: string;
}

/**
 * A page of the chapter view: each chapter once per day it was read, at that day's
 * latest read, newest first. Pages continue from `cursor`, so new reads never shift
 * later pages.
 */
export async function listHistory(
  db: Queryable,
  filter: HistoryFilter,
  page: { cursor: HistoryCursor | null; limit: number },
): Promise<{ items: HistoryEntry[]; nextCursor: string | null }> {
  const { values, param } = queryValues();
  const where = historyWhere(filter, param);
  const after =
    page.cursor === null
      ? '1 = 1'
      : `(r.read_at, r.id) < (${param(page.cursor.readAt)}, ${param(page.cursor.id)})`;
  const limit = param(page.limit + 1);

  const { rows } = await db.query<EntryRow>(
    `WITH ranked AS (
       SELECT h.id, h.novel_id, h.chapter_id, h.read_at, h.read_day,
              row_number() OVER (PARTITION BY h.chapter_id, h.read_day
                                 ORDER BY h.read_at DESC, h.id DESC) AS rank
       FROM reading_history h
       WHERE ${where}
     )
     SELECT r.id, r.read_at, r.read_day AS date,
            n.id AS novel_id, n.title, n.author, n.cover_updated_at,
            c.number, c.title AS chapter_title
     FROM ranked r
     JOIN novels n ON n.id = r.novel_id
     JOIN chapters c ON c.id = r.chapter_id
     WHERE r.rank = 1 AND ${after}
     ORDER BY r.read_at DESC, r.id DESC
     LIMIT ${limit}`,
    values,
  );

  const more = rows.length > page.limit;
  const shown = more ? rows.slice(0, page.limit) : rows;
  const last = shown.at(-1);
  return {
    nextCursor: more && last ? formatCursor({ readAt: last.read_at, id: last.id }) : null,
    items: shown.map((row) => ({
      id: String(row.id),
      readAt: row.read_at,
      date: row.date,
      novel: {
        id: row.novel_id,
        title: row.title,
        author: row.author,
        coverUrl: coverUrl(row.novel_id, row.cover_updated_at),
      },
      chapter: { number: row.number, title: row.chapter_title },
    })),
  };
}

/** The history summary: distinct chapters, novels and authors, and every view. */
export async function historyStats(db: Queryable, filter: HistoryFilter): Promise<HistoryStats> {
  const { values, param } = queryValues();
  const where = historyWhere(filter, param);
  const { rows } = await db.query<HistoryStats>(
    `SELECT count(DISTINCT h.chapter_id) AS "chaptersRead",
            count(DISTINCT h.novel_id) AS "novelsRead",
            count(DISTINCT lower(n.author)) AS "authorsRead",
            count(*) AS reads
     FROM reading_history h JOIN novels n ON n.id = h.novel_id
     WHERE ${where}`,
    values,
  );
  return rows[0] ?? { chaptersRead: 0, novelsRead: 0, authorsRead: 0, reads: 0 };
}

/** Novels in the history for the novel filter, most recently read first. */
export async function historyNovels(
  db: Queryable,
  query: { q: string | null; limit: number },
): Promise<HistoryNovelsResponse['novels']> {
  const { values, param } = queryValues();
  const search = query.q === null ? null : titleOrAuthorMatch(query.q, param);
  const { rows } = await db.query<{
    id: string;
    title: string;
    author: string | null;
    cover_updated_at: string | null;
    last_read_at: string;
  }>(
    `SELECT n.id, n.title, n.author, n.cover_updated_at, max(h.read_at) AS last_read_at
     FROM reading_history h JOIN novels n ON n.id = h.novel_id
     ${search === null ? '' : `WHERE ${search}`}
     GROUP BY n.id
     ORDER BY last_read_at DESC, n.title_key, n.id
     LIMIT ${param(query.limit)}`,
    values,
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    author: row.author,
    coverUrl: coverUrl(row.id, row.cover_updated_at),
    lastReadAt: row.last_read_at,
  }));
}

interface ByNovelRow extends NovelSummaryRow {
  chapters_read: number;
  reads: number;
  last_read_at: string;
  highest_read: number;
  last_number: number;
  last_title: string;
  furthest_chapter_number: number | null;
  last_read_chapter_number: number | null;
  in_library: number;
}

/**
 * The novel view: per novel, distinct chapters read and views in the range, the chapter
 * read last, progress and where Continue Reading goes; most recent first.
 */
export async function historyByNovel(
  db: Queryable,
  filter: HistoryFilter,
  page: { page: number; limit: number },
): Promise<{ items: HistoryNovelItem[]; total: number }> {
  const { values, param } = queryValues();
  const where = historyWhere(filter, param);
  const counted = [...values];
  const limit = param(page.limit);
  const offset = param((page.page - 1) * page.limit);

  const [items, total] = await Promise.all([
    db.query<ByNovelRow>(
      `WITH per_novel AS (
         SELECT h.novel_id, count(DISTINCT h.chapter_id) AS chapters_read,
                count(*) AS reads, max(h.read_at) AS last_read_at,
                max(c.number) AS highest_read
         FROM reading_history h JOIN chapters c ON c.id = h.chapter_id
         WHERE ${where}
         GROUP BY h.novel_id
       ),
       ranked AS (
         SELECT h.novel_id, c.number, c.title,
                row_number() OVER (PARTITION BY h.novel_id
                                   ORDER BY h.read_at DESC, h.id DESC) AS rank
         FROM reading_history h JOIN chapters c ON c.id = h.chapter_id
         WHERE ${where}
       )
       SELECT ${NOVEL_SUMMARY_COLUMNS}, p.chapters_read, p.reads, p.last_read_at, p.highest_read,
              l.number AS last_number, l.title AS last_title,
              e.furthest_chapter_number, e.last_read_chapter_number,
              e.novel_id IS NOT NULL AS in_library
       FROM per_novel p
       JOIN ranked l ON l.novel_id = p.novel_id AND l.rank = 1
       JOIN novels n ON n.id = p.novel_id
       JOIN source_sites s ON s.key = n.source
       LEFT JOIN library_entries e ON e.novel_id = n.id
       ORDER BY p.last_read_at DESC, n.id
       LIMIT ${limit} OFFSET ${offset}`,
      values,
    ),
    db.query<{ total: number }>(
      `SELECT count(DISTINCT h.novel_id) AS total FROM reading_history h WHERE ${where}`,
      counted,
    ),
  ]);

  return {
    total: total.rows[0]?.total ?? 0,
    items: items.rows.map((row) => ({
      novel: toNovelSummary(row),
      chaptersRead: row.chapters_read,
      reads: row.reads,
      lastReadAt: row.last_read_at,
      lastChapter: { number: row.last_number, title: row.last_title },
      furthestChapterNumber: row.furthest_chapter_number ?? row.highest_read,
      continueChapterNumber: row.last_read_chapter_number ?? row.last_number,
      inLibrary: bool(row.in_library),
    })),
  };
}
