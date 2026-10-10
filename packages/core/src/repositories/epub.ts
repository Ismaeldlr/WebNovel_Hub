import { EPUB_SOURCE } from '@webnovel-hub/shared';
import type { Queryable } from '../db/database.js';
import { NOW } from '../db/sql.js';
import { newId, searchKey } from '../db/values.js';
import type { EpubChapter } from '../epub/parser.js';
import { type Cover, saveCover } from './covers.js';
import { insertLibraryEntry } from './library.js';

export interface NewEpubNovel {
  id: string;
  /** `epub:sha256:<hex>`. */
  sourceUrl: string;
  title: string;
  author: string | null;
  description: string | null;
  tags: string[];
  cover: Cover | null;
  chapters: EpubChapter[];
}

/** Chapters per INSERT, so one statement never carries a whole novel's text. */
const BATCH = 200;

/**
 * Stores an imported EPUB: the novel (`source = epub`), its chapters, already fetched,
 * their text, its cover and its library entry. Run it inside a transaction.
 */
export async function insertEpubNovel(tx: Queryable, novel: NewEpubNovel): Promise<void> {
  await tx.query(
    `INSERT INTO novels (id, source, source_url, title, author, title_key, author_key,
                         description, tags, total_chapters, latest_chapter_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, ${NOW})`,
    [
      novel.id,
      EPUB_SOURCE,
      novel.sourceUrl,
      novel.title,
      novel.author,
      searchKey(novel.title),
      searchKey(novel.author),
      novel.description,
      novel.tags,
      novel.chapters.length,
    ],
  );

  for (let start = 0; start < novel.chapters.length; start += BATCH) {
    const batch = novel.chapters.slice(start, start + BATCH).map((chapter, index) => ({
      id: newId(),
      number: start + index + 1,
      title: chapter.title,
      text: chapter.text,
      words: chapter.wordCount,
    }));
    await tx.query(
      `INSERT INTO chapters (id, novel_id, number, title, is_fetched, fetched_at)
       SELECT value ->> 'id', $1, value ->> 'number', value ->> 'title', 1, ${NOW}
       FROM json_each($2)`,
      [novel.id, batch.map(({ id, number, title }) => ({ id, number, title }))],
    );
    await tx.query(
      `INSERT INTO chapter_contents (chapter_id, content, word_count)
       SELECT value ->> 'id', value ->> 'text', value ->> 'words' FROM json_each($1)`,
      [batch.map(({ id, text, words }) => ({ id, text, words }))],
    );
  }

  if (novel.cover) await saveCover(tx, novel.id, novel.cover);
  await insertLibraryEntry(tx, novel.id);
}

/** Words in all of a novel's stored chapters. */
export async function novelWordCount(db: Queryable, novelId: string): Promise<number> {
  const { rows } = await db.query<{ words: number }>(
    `SELECT coalesce(sum(cc.word_count), 0) AS words
     FROM chapters c JOIN chapter_contents cc ON cc.chapter_id = c.id
     WHERE c.novel_id = $1`,
    [novelId],
  );
  return rows[0]?.words ?? 0;
}
