// `chapter_fetch`: one chapter, fetched, normalized and stored. Once stored, the reader
// reads it from the database and it is never fetched again.
import type { Database } from '../db/database.js';
import { NOW } from '../db/sql.js';
import { countWords, htmlToText } from '../epub/normalize.js';
import type { Registry } from '../scraper/adapters/registry.js';
import { InvalidJob, NovelDeleted, StructureChanged } from '../scraper/errors.js';
import type { SourceSession } from '../scraper/session.js';
import type { Handler } from './context.js';

export interface Stored {
  wordCount: number;
  /** False when the chapter was stored already and nothing was asked of the site. */
  fetched: boolean;
}

/** Fetches one chapter from its site and stores its text, unless it is stored already. */
export async function fetchAndStore(
  db: Database,
  registry: Registry,
  session: SourceSession,
  target: { novelId: string | null; chapterId: string | null },
  progress?: (message: string, percent: number) => Promise<void>,
): Promise<Stored> {
  const { rows } = await db.query<{
    title: string;
    source_url: string | null;
    is_fetched: number;
    word_count: number | null;
  }>(
    `SELECT c.title, c.source_url, c.is_fetched, cc.word_count
     FROM chapters c LEFT JOIN chapter_contents cc ON cc.chapter_id = c.id
     WHERE c.id = $1 AND c.novel_id = $2`,
    [target.chapterId, target.novelId],
  );
  const chapter = rows[0];
  if (!chapter) {
    const novel = await db.query('SELECT 1 FROM novels WHERE id = $1', [target.novelId]);
    if (novel.rows.length === 0) throw new NovelDeleted(`novel ${target.novelId} was deleted`);
    throw new InvalidJob(`chapter ${target.chapterId} of novel ${target.novelId} does not exist`);
  }
  if (chapter.is_fetched) return { wordCount: chapter.word_count ?? 0, fetched: false };
  if (!chapter.source_url) {
    throw new InvalidJob(`chapter ${target.chapterId} has no source URL (an EPUB chapter)`);
  }

  const adapter = registry.forUrl(chapter.source_url);
  await progress?.(`Fetching from ${adapter.name}…`, 10);
  const page = await adapter.fetchChapter(session, {
    url: chapter.source_url,
    title: chapter.title,
    publishedAt: null,
  });
  const text = htmlToText(page.html);
  if (!text) throw new StructureChanged(`no chapter text at ${chapter.source_url}`);
  const wordCount = countWords(text);

  // A novel deleted while the page was fetched fails the insert (foreign key), which
  // counts as `NovelDeleted`.
  await db.withTransaction(async (tx) => {
    await tx.query(
      `INSERT INTO chapter_contents (chapter_id, content, word_count) VALUES ($1, $2, $3)
       ON CONFLICT (chapter_id) DO UPDATE
         SET content = excluded.content, word_count = excluded.word_count`,
      [target.chapterId, text, wordCount],
    );
    await tx.query(
      `UPDATE chapters
       SET is_fetched = 1, fetched_at = ${NOW}, fetch_error_type = NULL, fetch_error_message = NULL
       WHERE id = $1`,
      [target.chapterId],
    );
  });
  return { wordCount, fetched: true };
}

export const fetchChapter: Handler = async (ctx) => {
  const stored = await fetchAndStore(
    ctx.db,
    ctx.registry,
    ctx.session,
    { novelId: ctx.job.novelId, chapterId: ctx.job.chapterId },
    (message, percent) => ctx.progress(message, percent),
  );
  return { word_count: stored.wordCount };
};
