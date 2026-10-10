import type {
  LibraryState,
  ReaderChapter,
  ReaderNavigation,
  ReaderNovel,
  ScrapeErrorType,
  ScrapeFailure,
} from '@webnovel-hub/shared';
import type { Queryable } from '../db/database.js';
import { NOW } from '../db/sql.js';
import { localDay } from '../db/values.js';
import { LIBRARY_STATE_COLUMNS, type LibraryStateRow, toLibraryState } from './novels.js';

/** A chapter with its novel, neighbours and text, and the novel's library entry. */
export interface ReaderLookup {
  novel: ReaderNovel;
  library: LibraryState | null;
  /** Null when the novel has no chapter with that number. */
  chapter: {
    view: ReaderChapter;
    navigation: ReaderNavigation;
    /** Where the scraper fetches it from; null for EPUB chapters. */
    sourceUrl: string | null;
    /** The stored text, or null when it hasn't been fetched. */
    content: { text: string; wordCount: number } | null;
    /** Why the last fetch failed, if it did. */
    fetchFailure: ScrapeFailure | null;
  } | null;
}

interface ReaderRow extends LibraryStateRow {
  novel_id: string;
  novel_title: string;
  author: string | null;
  source: string;
  source_name: string;
  total_chapters: number;
  chapter_id: string | null;
  chapter_number: number | null;
  chapter_title: string | null;
  published_at: string | null;
  chapter_source_url: string | null;
  fetch_error_type: ScrapeErrorType | null;
  fetch_error_message: string | null;
  content: string | null;
  word_count: number | null;
  previous_number: number | null;
  previous_title: string | null;
  next_number: number | null;
  next_title: string | null;
}

const link = (number: number | null, title: string | null) =>
  number === null || title === null ? null : { number, title };

const neighbour = (column: string, comparison: '<' | '>', order: 'ASC' | 'DESC') => `
  (SELECT ${column} FROM chapters
   WHERE novel_id = n.id AND number ${comparison} $2 ORDER BY number ${order} LIMIT 1)`;

/**
 * Chapter `number` of a novel with everything the reader shows, or null when the novel
 * doesn't exist. The neighbours are the nearest numbers below and above, so a gap in the
 * numbering never breaks navigation.
 */
export async function findReaderChapter(
  db: Queryable,
  lookup: { novelId: string; number: number },
): Promise<ReaderLookup | null> {
  const { rows } = await db.query<ReaderRow>(
    `SELECT n.id AS novel_id, n.title AS novel_title, n.author, n.source,
            s.name AS source_name, n.total_chapters,
            c.id AS chapter_id, c.number AS chapter_number, c.title AS chapter_title,
            c.published_at, c.source_url AS chapter_source_url,
            c.fetch_error_type, c.fetch_error_message,
            cc.content, cc.word_count,
            ${neighbour('number', '<', 'DESC')} AS previous_number,
            ${neighbour('title', '<', 'DESC')} AS previous_title,
            ${neighbour('number', '>', 'ASC')} AS next_number,
            ${neighbour('title', '>', 'ASC')} AS next_title,
            ${LIBRARY_STATE_COLUMNS}
     FROM novels n
     JOIN source_sites s ON s.key = n.source
     LEFT JOIN chapters c ON c.novel_id = n.id AND c.number = $2
     LEFT JOIN chapter_contents cc ON cc.chapter_id = c.id
     LEFT JOIN library_entries e ON e.novel_id = n.id
     WHERE n.id = $1`,
    [lookup.novelId, lookup.number],
  );
  const row = rows[0];
  if (!row) return null;

  const novel: ReaderNovel = {
    id: row.novel_id,
    title: row.novel_title,
    author: row.author,
    source: { key: row.source, name: row.source_name },
    totalChapters: row.total_chapters,
  };
  const library = toLibraryState(row);
  if (row.chapter_id === null || row.chapter_number === null || row.chapter_title === null) {
    return { novel, library, chapter: null };
  }
  return {
    novel,
    library,
    chapter: {
      view: {
        id: row.chapter_id,
        number: row.chapter_number,
        title: row.chapter_title,
        publishedAt: row.published_at,
      },
      navigation: {
        previous: link(row.previous_number, row.previous_title),
        next: link(row.next_number, row.next_title),
      },
      sourceUrl: row.chapter_source_url,
      content: row.content === null ? null : { text: row.content, wordCount: row.word_count ?? 0 },
      fetchFailure:
        row.fetch_error_type !== null && row.fetch_error_message !== null
          ? { type: row.fetch_error_type, message: row.fetch_error_message }
          : null,
    },
  };
}

/**
 * Records that the reader read a chapter: a history row (with their local date); the
 * Continue Reading chapter, the furthest chapter (never lowered) and the time; and the
 * chapter's NEW marker as seen. Run it in a transaction.
 */
export async function recordRead(
  db: Queryable,
  read: { novelId: string; chapterId: string; number: number },
  at: Date = new Date(),
): Promise<void> {
  await db.query(
    'INSERT INTO reading_history (novel_id, chapter_id, read_at, read_day) VALUES ($1, $2, $3, $4)',
    [read.novelId, read.chapterId, at, localDay(at)],
  );
  await db.query(
    `UPDATE library_entries
     SET last_read_chapter_number = $2,
         furthest_chapter_number = max(coalesce(furthest_chapter_number, 0), $2),
         last_read_at = $3
     WHERE novel_id = $1`,
    [read.novelId, read.number, at],
  );
  await db.query(
    `UPDATE new_chapters SET seen_at = ${NOW} WHERE chapter_id = $1 AND seen_at IS NULL`,
    [read.chapterId],
  );
}
