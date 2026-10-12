import type { Queryable } from '../src/db/database.js';
import { searchKey } from '../src/db/values.js';

export interface NovelFixture {
  source?: string;
  sourceUrl?: string;
  title?: string;
  author?: string | null;
  tags?: string[];
  chapters?: number;
  /** Chapter numbers whose text is stored. */
  fetched?: number[];
  /** Chapter numbers whose last fetch failed. */
  failed?: number[];
}

let novelCount = 0;

/** Inserts a novel in the library with `chapters` chapters, as an import would. */
export async function insertNovel(
  db: Queryable,
  fixture: NovelFixture = {},
): Promise<{ id: string; chapterIds: string[] }> {
  novelCount += 1;
  const {
    source = 'royal_road',
    sourceUrl = `https://www.royalroad.com/fiction/${novelCount}`,
    title = `Test Novel ${novelCount}`,
    author = 'A. Writer',
    tags = ['Fantasy', 'Adventure'],
    chapters = 10,
    fetched = [],
    failed = [],
  } = fixture;

  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO novels (source, source_url, title, author, title_key, author_key, description,
                         tags, total_chapters, last_scraped_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'A description.', $7, $8, '2026-01-01T00:00:00.000Z')
     RETURNING id`,
    [source, sourceUrl, title, author, searchKey(title), searchKey(author), tags, chapters],
  );
  const novelId = rows[0]?.id;
  if (!novelId) throw new Error('insertNovel: no id');
  await db.query('INSERT INTO library_entries (novel_id) VALUES ($1)', [novelId]);

  const chapterIds: string[] = [];
  for (let n = 1; n <= chapters; n++) {
    const isFetched = fetched.includes(n);
    const isFailed = failed.includes(n);
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO chapters (novel_id, number, title, source_url, published_at, is_fetched,
                             fetched_at, fetch_error_type, fetch_error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        novelId,
        n,
        `Chapter ${n}: Part ${n}`,
        source === 'epub' ? null : `${sourceUrl}/chapter/${n}`,
        new Date(Date.UTC(2026, 0, 1 + n)),
        isFetched,
        isFetched ? new Date() : null,
        isFailed ? 'network_error' : null,
        isFailed ? "We couldn't reach Royal Road." : null,
      ],
    );
    const id = inserted.rows[0]!.id;
    chapterIds.push(id);
    if (isFetched) {
      await db.query(
        `INSERT INTO chapter_contents (chapter_id, content, word_count) VALUES ($1, 'Some text.', 2)`,
        [id],
      );
    }
  }
  return { id: novelId, chapterIds };
}
