// `novel_ingestion`: a novel's metadata, chapter list and cover, stored together in one
// transaction, so a failed import leaves nothing behind. Chapter text isn't fetched here:
// chapters arrive when they are read (and the next few with them).
import type { Queryable } from '../db/database.js';
import { NOW } from '../db/sql.js';
import { newId, searchKey } from '../db/values.js';
import { type Cover, saveCover } from '../repositories/covers.js';
import { insertLibraryEntry } from '../repositories/library.js';
import type { ChapterRef, NovelMeta } from '../scraper/adapters/base.js';
import { downloadCover } from '../scraper/covers.js';
import { InvalidJob, StructureChanged } from '../scraper/errors.js';
import type { Handler, JobContext } from './context.js';

/** Chapters per INSERT, so one statement never carries a whole chapter list. */
const BATCH = 500;

interface ExistingNovel {
  id: string;
  title: string;
  total_chapters: number;
}

const plural = (count: number, word: string) =>
  `${count.toLocaleString('en-US')} ${word}${count === 1 ? '' : 's'}`;

export const ingestNovel: Handler = async (ctx) => {
  const url = ctx.job.payload.url;
  if (typeof url !== 'string' || !url) {
    throw new InvalidJob(`novel_ingestion payload has no url: ${JSON.stringify(ctx.job.payload)}`);
  }
  const adapter = ctx.registry.forUrl(url);
  const canonical = adapter.canonicalize(url);

  // Stored already (imported while this job waited): nothing to fetch.
  const existing = await findNovel(ctx.db, canonical);
  if (existing) return duplicate(existing);

  await ctx.progress(`Opening ${adapter.name}…`, 5);
  const meta = await adapter.fetchNovel(ctx.session, canonical);
  const title = meta.title.trim();
  if (!title) throw new StructureChanged(`empty novel title at ${canonical}`);

  await ctx.progress('Reading the chapter list…', 30);
  const chapters = withoutRepeats(ctx, await adapter.fetchChapterList(ctx.session, canonical));
  await ctx.progress(`Found ${plural(chapters.length, 'chapter')}`, 70);

  let cover: Cover | null = null;
  if (meta.coverUrl) {
    await ctx.progress('Downloading cover…', 80);
    cover = await downloadCover(ctx.session, meta.coverUrl, ctx.logger);
  }

  await ctx.progress('Saving…', 90);
  ctx.signal.throwIfAborted();
  const result = await ctx.db.withTransaction((tx) =>
    store(tx, { source: adapter.source, canonical, title, meta, chapters, cover }),
  );
  if (!result.duplicate) {
    ctx.logger.info(
      { novel: result.novel_id, chapters: chapters.length, cover: cover !== null },
      'novel stored',
    );
  }
  return result;
};

async function store(
  tx: Queryable,
  novel: {
    source: string;
    canonical: string;
    title: string;
    meta: NovelMeta;
    chapters: ChapterRef[];
    cover: Cover | null;
  },
): Promise<Record<string, unknown>> {
  const { meta, chapters } = novel;
  const dates = chapters.flatMap((chapter) =>
    chapter.publishedAt ? [chapter.publishedAt.getTime()] : [],
  );
  const latest =
    dates.length > 0 ? new Date(Math.max(...dates)) : chapters.length > 0 ? new Date() : null;
  const author = clean(meta.author);
  const id = newId();
  const inserted = await tx.query(
    `INSERT INTO novels (id, source, source_url, title, author, title_key, author_key,
                         description, tags, cover_source_url, total_chapters, last_scraped_at,
                         latest_chapter_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, ${NOW}, $12)
     ON CONFLICT (source_url) DO NOTHING
     RETURNING id`,
    [
      id,
      novel.source,
      novel.canonical,
      novel.title,
      author,
      searchKey(novel.title),
      searchKey(author),
      clean(meta.description),
      meta.tags.map((tag) => tag.trim()).filter(Boolean),
      meta.coverUrl,
      chapters.length,
      latest,
    ],
  );
  if (inserted.rows.length === 0) {
    // Another import stored the same novel between the first check and now.
    const existing = await findNovel(tx, novel.canonical);
    if (!existing) throw new Error(`novel ${novel.canonical} is neither new nor stored`);
    return duplicate(existing);
  }

  await insertChapters(tx, id, 1, chapters);
  if (novel.cover) await saveCover(tx, id, novel.cover, meta.coverUrl);
  await insertLibraryEntry(tx, id);
  return { novel_id: id, title: novel.title, chapter_count: chapters.length, duplicate: false };
}

/** Stores `chapters` numbered from `first`, in batches; returns their ids in order. */
export async function insertChapters(
  tx: Queryable,
  novelId: string,
  first: number,
  chapters: ChapterRef[],
): Promise<string[]> {
  const ids: string[] = [];
  for (let start = 0; start < chapters.length; start += BATCH) {
    const batch = chapters.slice(start, start + BATCH).map((chapter, index) => {
      const number = first + start + index;
      const id = newId();
      ids.push(id);
      return {
        id,
        number,
        title: chapter.title.trim() || `Chapter ${number}`,
        url: chapter.url,
        published: chapter.publishedAt?.toISOString() ?? null,
      };
    });
    await tx.query(
      `INSERT INTO chapters (id, novel_id, number, title, source_url, published_at)
       SELECT value ->> 'id', $1, value ->> 'number', value ->> 'title', value ->> 'url',
              value ->> 'published'
       FROM json_each($2)`,
      [novelId, batch],
    );
  }
  return ids;
}

async function findNovel(db: Queryable, sourceUrl: string): Promise<ExistingNovel | null> {
  const { rows } = await db.query<ExistingNovel>(
    'SELECT id, title, total_chapters FROM novels WHERE source_url = $1',
    [sourceUrl],
  );
  return rows[0] ?? null;
}

const duplicate = (novel: ExistingNovel) => ({
  novel_id: novel.id,
  title: novel.title,
  chapter_count: novel.total_chapters,
  duplicate: true,
});

/** Chapter addresses are unique per novel: the first of any repeats is kept. */
function withoutRepeats(ctx: JobContext, chapters: ChapterRef[]): ChapterRef[] {
  const seen = new Set<string>();
  const kept = chapters.filter((chapter) => {
    if (seen.has(chapter.url)) return false;
    seen.add(chapter.url);
    return true;
  });
  if (kept.length < chapters.length) {
    ctx.logger.warn({ repeats: chapters.length - kept.length }, 'chapter list repeats URLs');
  }
  return kept;
}

const clean = (value: string | null) => value?.trim() || null;
