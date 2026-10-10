import { PROFILE_ACTIVITY_DAYS, type Profile } from '@webnovel-hub/shared';
import type { Queryable } from '../db/database.js';
import { addDays, localDay } from '../db/values.js';
import { libraryStats } from './library.js';
import { NOVEL_SUMMARY_COLUMNS, type NovelSummaryRow, toNovelSummary } from './novels.js';

export type ProfileStats = Omit<Profile, 'timezone'>;

/** The longest run of consecutive days, and the run that reaches today or yesterday. */
export function streaksOf(days: string[], today: string): ProfileStats['streaks'] {
  let longest = 0;
  let current = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of days) {
    run = previous !== null && addDays(previous, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  if (previous !== null && previous >= addDays(today, -1)) current = run;
  return { current, longest, lastReadDate: previous };
}

/**
 * The profile's reading statistics. Days are the reader's local dates when they read, so
 * a chapter read at 23:50 and one at 00:10 fall on two days.
 */
export async function readProfileStats(
  db: Queryable,
  today: string = localDay(),
): Promise<ProfileStats> {
  const firstActivityDay = addDays(today, -(PROFILE_ACTIVITY_DAYS - 1));
  const [totals, words, days, activity, library, bySource, novels] = await Promise.all([
    db.query<Omit<ProfileStats['totals'], 'wordsRead'>>(
      `SELECT count(DISTINCT h.chapter_id) AS "chaptersRead",
              count(DISTINCT h.novel_id) AS "novelsRead",
              count(DISTINCT lower(n.author)) AS "authorsRead",
              count(DISTINCT h.read_day) AS "readingDays",
              count(*) AS reads
       FROM reading_history h JOIN novels n ON n.id = h.novel_id`,
    ),
    db.query<{ words: number }>(
      `SELECT coalesce(sum(cc.word_count), 0) AS words
       FROM chapter_contents cc
       WHERE cc.chapter_id IN (SELECT chapter_id FROM reading_history)`,
    ),
    db.query<{ day: string }>('SELECT DISTINCT read_day AS day FROM reading_history ORDER BY day'),
    db.query<{ day: string; chapters: number }>(
      `SELECT read_day AS day, count(DISTINCT chapter_id) AS chapters
       FROM reading_history WHERE read_day >= $1
       GROUP BY read_day`,
      [firstActivityDay],
    ),
    libraryStats(db),
    db.query<{ key: string; name: string; count: number }>(
      `SELECT s.key, s.name, count(*) AS count
       FROM library_entries e
       JOIN novels n ON n.id = e.novel_id
       JOIN source_sites s ON s.key = n.source
       GROUP BY s.key, s.name
       ORDER BY count DESC, s.name`,
    ),
    // Every novel read from, with the distinct chapters read; the most-read five and the
    // longest one come from these rows.
    db.query<NovelSummaryRow & { chapters_read: number; last_read_at: string }>(
      `SELECT ${NOVEL_SUMMARY_COLUMNS}, r.chapters_read, r.last_read_at
       FROM (
         SELECT novel_id, count(DISTINCT chapter_id) AS chapters_read,
                max(read_at) AS last_read_at
         FROM reading_history GROUP BY novel_id
       ) r
       JOIN novels n ON n.id = r.novel_id
       JOIN source_sites s ON s.key = n.source`,
    ),
  ]);

  const read = novels.rows.map((row) => ({
    row,
    item: { novel: toNovelSummary(row), chaptersRead: row.chapters_read },
  }));
  const byTitle = (a: NovelSummaryRow, b: NovelSummaryRow) =>
    a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
  const mostRead = [...read]
    .sort(
      (a, b) =>
        b.row.chapters_read - a.row.chapters_read ||
        b.row.last_read_at.localeCompare(a.row.last_read_at) ||
        byTitle(a.row, b.row),
    )
    .slice(0, 5)
    .map(({ item }) => item);
  const longest = [...read].sort(
    (a, b) => b.row.total_chapters - a.row.total_chapters || byTitle(a.row, b.row),
  )[0];

  const perDay = new Map(activity.rows.map((row) => [row.day, row.chapters]));
  return {
    totals: {
      chaptersRead: totals.rows[0]?.chaptersRead ?? 0,
      novelsRead: totals.rows[0]?.novelsRead ?? 0,
      authorsRead: totals.rows[0]?.authorsRead ?? 0,
      wordsRead: words.rows[0]?.words ?? 0,
      readingDays: totals.rows[0]?.readingDays ?? 0,
      reads: totals.rows[0]?.reads ?? 0,
    },
    streaks: streaksOf(
      days.rows.map((row) => row.day),
      today,
    ),
    activity: Array.from({ length: PROFILE_ACTIVITY_DAYS }, (_, i) => {
      const date = addDays(firstActivityDay, i);
      return { date, chapters: perDay.get(date) ?? 0 };
    }),
    library: {
      total: library.total,
      byStatus: library.byStatus,
      bySource: bySource.rows.map((row) => ({
        source: { key: row.key, name: row.name },
        count: row.count,
      })),
    },
    mostRead,
    longestNovel: longest?.item ?? null,
  };
}
