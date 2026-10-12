import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { insertNovel } from '../../test/catalog.js';
import { addSource, openTestDatabase } from '../../test/database.js';
import { png, sampleEpub } from '../../test/epub.js';
import type { Database } from '../db/database.js';
import { localDay } from '../db/values.js';
import { AppError } from '../errors.js';
import { silentLogger } from '../logger.js';
import { readProfileStats, streaksOf } from '../repositories/profile.js';
import { recordRead } from '../repositories/reader.js';
import { createCatalogService } from './catalog.js';
import { createEpubExportService } from './epub-export.js';
import { createEpubImportService } from './epub-import.js';
import { createFullFetchService } from './full-fetch.js';
import { createHistoryService } from './history.js';
import { createImportService } from './imports.js';
import { createLibraryService } from './library.js';
import { createNovelManagementService } from './novel-management.js';
import { createPrefetcher } from './prefetch.js';
import { createPreferencesService } from './preferences.js';
import { createReaderService } from './reader.js';
import { createUpdateService } from './updates.js';

let db: Database;

beforeEach(async () => {
  db = await openTestDatabase();
  await addSource(db, 'royal_road', 'Royal Road');
});
afterEach(() => db.close());

const prefetcher = () => createPrefetcher({ db, logger: silentLogger, maxRetries: 3 });
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

/** The status of the AppError a promise rejects with. */
async function failsWith(promise: Promise<unknown>): Promise<number> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(error instanceof AppError)) throw new Error(`expected an AppError, got ${String(error)}`);
  return error.status;
}

async function jobs() {
  const { rows } = await db.query<{ type: string; priority: number; chapter_id: string | null }>(
    'SELECT type, priority, chapter_id FROM scrape_jobs ORDER BY created_at, priority',
  );
  return rows;
}

describe('library', () => {
  it('lists, filters, sorts, counts and deletes', async () => {
    const library = createLibraryService(db);
    const b = await insertNovel(db, { title: 'Beta Tale', chapters: 2 });
    const a = await insertNovel(db, { title: 'Alpha Saga', author: 'Zed', chapters: 3 });

    const list = (query = {}) =>
      library.list({
        status: null,
        source: null,
        favorite: null,
        unread: null,
        tag: null,
        q: null,
        sort: 'title',
        page: 1,
        limit: 10,
        ...query,
      });
    expect((await list()).items.map((item) => item.novel.title)).toEqual([
      'Alpha Saga',
      'Beta Tale',
    ]);
    expect((await list({ q: 'zed' })).items.map((item) => item.novel.id)).toEqual([a.id]);

    await library.setFavorite(b.id, true);
    await library.setStatus(b.id, 'following');
    const favorites = await list({ favorite: true });
    expect(favorites.items).toHaveLength(1);
    expect(favorites.items[0]?.library).toMatchObject({ isFavorite: true, status: 'following' });

    await db.query('INSERT INTO new_chapters (novel_id, chapter_id) VALUES ($1, $2)', [
      a.id,
      a.chapterIds[2],
    ]);
    expect((await list({ unread: true })).items.map((item) => item.novel.id)).toEqual([a.id]);
    expect(await library.newChaptersCount()).toBe(1);
    expect(await library.stats()).toMatchObject({
      total: 2,
      favorites: 1,
      newChapters: 1,
      novelsWithNewChapters: 1,
      byStatus: { reading: 1, following: 1, on_hold: 0 },
    });

    await library.remove(b.id);
    expect((await list()).total).toBe(1);
    expect(await failsWith(library.remove(b.id))).toBe(404);
  });

  it('sorts by progress', async () => {
    const library = createLibraryService(db);
    const half = await insertNovel(db, { title: 'Half', chapters: 4, fetched: [1, 2] });
    await insertNovel(db, { title: 'None', chapters: 4 });
    await recordRead(db, { novelId: half.id, chapterId: half.chapterIds[1]!, number: 2 });
    const page = await library.list({
      status: null,
      source: null,
      favorite: null,
      unread: null,
      tag: null,
      q: null,
      sort: 'progress',
      page: 1,
      limit: 10,
    });
    expect(page.items.map((item) => item.novel.title)).toEqual(['Half', 'None']);
  });

  it('filters by tag and lists the tags, ignoring case', async () => {
    const library = createLibraryService(db);
    const a = await insertNovel(db, { title: 'Alpha', tags: ['Action', 'Magic'] });
    const b = await insertNovel(db, { title: 'Beta', tags: ['action'] });
    await insertNovel(db, { title: 'Gamma', tags: [] });
    const tagged = async (tag: string) =>
      (
        await library.list({
          status: null,
          source: null,
          favorite: null,
          unread: null,
          tag,
          q: null,
          sort: 'title',
          page: 1,
          limit: 10,
        })
      ).items.map((item) => item.novel.id);

    expect(await tagged('ACTION')).toEqual([a.id, b.id]);
    expect(await tagged('magic')).toEqual([a.id]);
    expect(await tagged('Act')).toEqual([]);
    expect(await library.tags()).toEqual([
      { tag: 'Action', novels: 2 },
      { tag: 'Magic', novels: 1 },
    ]);
  });
});

describe('catalog', () => {
  it('shows a novel and queues its first chapters', async () => {
    const catalog = createCatalogService(db, prefetcher());
    const { id } = await insertNovel(db, { chapters: 5 });
    const novel = await catalog.getNovel(id);
    expect(novel).toMatchObject({
      id,
      tags: ['Fantasy', 'Adventure'],
      source: { key: 'royal_road', name: 'Royal Road' },
      library: { status: 'reading', isFavorite: false },
      coverUrl: null,
    });
    await settle();
    expect(await jobs()).toHaveLength(3);
    expect(await failsWith(catalog.getNovel('missing'))).toBe(404);
  });

  it('pages chapters with read and NEW markers and searches them', async () => {
    const catalog = createCatalogService(db, prefetcher());
    const { id, chapterIds } = await insertNovel(db, { chapters: 12, fetched: [1] });
    await recordRead(db, { novelId: id, chapterId: chapterIds[0]!, number: 1 });
    await db.query('INSERT INTO new_chapters (novel_id, chapter_id) VALUES ($1, $2)', [
      id,
      chapterIds[11],
    ]);

    const page = await catalog.listChapters(id, { page: 1, limit: 5, order: 'desc', q: null });
    expect(page.total).toBe(12);
    expect(page.chapters.map((c) => c.number)).toEqual([12, 11, 10, 9, 8]);
    expect(page.chapters[0]).toMatchObject({ isNew: true, isRead: false, isFetched: false });

    const first = await catalog.listChapters(id, { page: 1, limit: 5, order: 'asc', q: '1' });
    expect(first.chapters[0]).toMatchObject({ number: 1, isRead: true, isFetched: true });
    const byTitle = await catalog.listChapters(id, {
      page: 1,
      limit: 5,
      order: 'asc',
      q: 'part 1',
    });
    expect(byTitle.chapters.map((c) => c.number)).toEqual([1, 10, 11, 12]);
  });

  it('searches titles, best match first', async () => {
    const catalog = createCatalogService(db, prefetcher());
    await insertNovel(db, { title: 'The Shadow Slave Returns', chapters: 1 });
    await insertNovel(db, { title: 'Shadow Slave', chapters: 1 });
    const found = await catalog.search({ q: 'shadow slave', limit: 10 });
    expect(found.total).toBe(2);
    expect(found.results.map((r) => r.novel.title)).toEqual([
      'Shadow Slave',
      'The Shadow Slave Returns',
    ]);
  });
});

describe('reader', () => {
  it('serves stored text, queues missing text and records reads', async () => {
    const reader = createReaderService({ db, prefetcher: prefetcher(), maxRetries: 3 });
    const { id, chapterIds } = await insertNovel(db, { chapters: 6, fetched: [1], failed: [3] });
    await db.query('INSERT INTO new_chapters (novel_id, chapter_id) VALUES ($1, $2)', [
      id,
      chapterIds[0],
    ]);

    const ready = await reader.getChapter(id, 1);
    expect(ready).toMatchObject({
      status: 'ready',
      content: 'Some text.',
      navigation: { previous: null, next: { number: 2, title: 'Chapter 2: Part 2' } },
      preferences: { fontSize: 18 },
    });
    await settle();
    expect((await jobs()).map((job) => job.priority)).toEqual([5, 5]);

    const fetching = await reader.getChapter(id, 2);
    expect(fetching).toMatchObject({ status: 'fetching' });
    const again = await reader.getChapter(id, 2);
    expect(again.status === 'fetching' && fetching.status === 'fetching' && again.jobId).toBe(
      fetching.status === 'fetching' && fetching.jobId,
    );
    expect((await jobs()).find((job) => job.chapter_id === chapterIds[1])?.priority).toBe(0);

    expect(await reader.getChapter(id, 3)).toMatchObject({ status: 'failed' });
    expect(await failsWith(reader.getChapter(id, 99))).toBe(404);

    const read = await reader.markRead(id, 1);
    expect(read.library).toMatchObject({ lastReadChapterNumber: 1, furthestChapterNumber: 1 });
    const history = await db.query<{ read_day: string }>('SELECT read_day FROM reading_history');
    expect(history.rows).toEqual([{ read_day: localDay() }]);
    const seen = await db.query('SELECT 1 FROM new_chapters WHERE seen_at IS NOT NULL');
    expect(seen.rows).toHaveLength(1);
    expect(await failsWith(reader.markRead(id, 2))).toBe(409);
  });
});

describe('history and profile', () => {
  it('groups reads by local day and pages them', async () => {
    const history = createHistoryService(db);
    const { id, chapterIds } = await insertNovel(db, { chapters: 3, fetched: [1, 2, 3] });
    const read = (index: number, at: string) =>
      recordRead(
        db,
        { novelId: id, chapterId: chapterIds[index]!, number: index + 1 },
        new Date(at),
      );
    await read(0, '2026-10-01T10:00:00.000Z');
    await read(0, '2026-10-01T11:00:00.000Z'); // same chapter, same day: one entry
    await read(1, '2026-10-02T10:00:00.000Z');
    await read(2, '2026-10-03T10:00:00.000Z');

    const first = await history.chapters({ range: 'all', novelId: null, cursor: null, limit: 2 });
    expect(first.items.map((item) => item.chapter.number)).toEqual([3, 2]);
    expect(first.nextCursor).not.toBeNull();
    const { parseCursor } = await import('../repositories/history.js');
    const second = await history.chapters({
      range: 'all',
      novelId: null,
      cursor: parseCursor(first.nextCursor!),
      limit: 2,
    });
    expect(second.items.map((item) => [item.chapter.number, item.readAt])).toEqual([
      [1, '2026-10-01T11:00:00.000Z'],
    ]);

    expect(await history.stats({ range: 'all', novelId: null })).toEqual({
      chaptersRead: 3,
      novelsRead: 1,
      authorsRead: 1,
      reads: 4,
    });
    const byNovel = await history.byNovel({ range: 'all', page: 1, limit: 10 });
    expect(byNovel.items[0]).toMatchObject({
      chaptersRead: 3,
      reads: 4,
      lastChapter: { number: 3 },
      continueChapterNumber: 3,
      inLibrary: true,
    });
    expect((await history.novels({ q: null, limit: 5 })).novels).toHaveLength(1);
    // Reads from October are outside the last 7 days of a later "today".
    const { historyStats } = await import('../repositories/history.js');
    expect(
      await historyStats(db, { range: '7d', novelId: null, today: '2026-10-20' }),
    ).toMatchObject({ reads: 0 });
  });

  it('counts streaks and the activity chart from local days', async () => {
    expect(
      streaksOf(
        ['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-05', '2026-10-06'],
        '2026-10-06',
      ),
    ).toEqual({
      current: 3,
      longest: 3,
      lastReadDate: '2026-10-06',
    });
    expect(streaksOf(['2026-10-01'], '2026-10-06')).toEqual({
      current: 0,
      longest: 1,
      lastReadDate: '2026-10-01',
    });

    const { id, chapterIds } = await insertNovel(db, { chapters: 2, fetched: [1, 2] });
    await recordRead(db, { novelId: id, chapterId: chapterIds[0]!, number: 1 });
    const stats = await readProfileStats(db);
    expect(stats.totals).toMatchObject({ chaptersRead: 1, readingDays: 1, wordsRead: 2 });
    expect(stats.streaks.current).toBe(1);
    expect(stats.activity.at(-1)).toEqual({ date: localDay(), chapters: 1 });
    expect(stats.library.bySource).toEqual([
      { source: { key: 'royal_road', name: 'Royal Road' }, count: 1 },
    ]);
    expect(stats.mostRead[0]?.chaptersRead).toBe(1);
  });
});

describe('preferences', () => {
  it('starts with the defaults and saves changes', async () => {
    const preferences = createPreferencesService(db);
    expect(await preferences.get()).toMatchObject({
      theme: 'system',
      fontSize: 18,
      lineSpacing: 1.6,
    });
    expect(await preferences.update({ fontSize: 22, lineSpacing: 1.8 })).toMatchObject({
      fontSize: 22,
      lineSpacing: 1.8,
      prefetchCount: 3,
    });
  });
});

describe('imports', () => {
  it('queues a URL import once and refuses stored or unsupported URLs', async () => {
    const imports = createImportService(db, { maxRetries: 3 });
    const url = 'https://royal_road.example/fiction/9';
    const first = await imports.importUrl(url);
    expect((await imports.importUrl(url)).jobId).toBe(first.jobId);
    const recent = await imports.recentImports(5);
    expect(recent).toEqual([
      expect.objectContaining({
        id: first.jobId,
        url,
        source: { key: 'royal_road', name: 'Royal Road' },
      }),
    ]);
    expect(await failsWith(imports.importUrl('https://unknown.example/x'))).toBe(400);
    expect(await failsWith(imports.importUrl('not a url'))).toBe(400);
    await insertNovel(db, { sourceUrl: 'https://royal_road.example/fiction/1' });
    expect(await failsWith(imports.importUrl('https://royal_road.example/fiction/1'))).toBe(409);
  });
});

describe('update checks', () => {
  it('queues one manual check per novel and lists runs', async () => {
    const updates = createUpdateService(db, { maxRetries: 3 });
    const { id } = await insertNovel(db, { chapters: 1 });
    const run = await updates.checkNovel(id);
    expect(run).toMatchObject({ trigger: 'manual', status: 'pending', novel: { id } });
    expect((await updates.checkNovel(id)).id).toBe(run.id);
    expect(await updates.listRuns({ page: 1, limit: 10 })).toMatchObject({ total: 1 });
    expect((await updates.latestCheck(id))?.id).toBe(run.id);

    const epub = await insertNovel(db, {
      source: 'epub',
      sourceUrl: `epub:sha256:${'a'.repeat(64)}`,
      chapters: 1,
    });
    expect(await failsWith(updates.checkNovel(epub.id))).toBe(409);
  });
});

describe('whole-novel fetches', () => {
  it('starts, lists and stops a fetch', async () => {
    const fullFetch = createFullFetchService(db, { maxRetries: 3 });
    const { id } = await insertNovel(db, { chapters: 4, fetched: [1] });
    const started = await fullFetch.start(id);
    expect(started).toMatchObject({
      fetch: { status: 'pending', queuedBehind: 0, canCancel: true },
      storedChapters: 1,
      totalChapters: 4,
    });
    expect((await fullFetch.start(id)).fetch?.id).toBe(started.fetch?.id);
    expect((await fullFetch.list()).items).toHaveLength(1);

    const other = await insertNovel(db, { chapters: 2 });
    expect((await fullFetch.start(other.id)).fetch?.queuedBehind).toBe(1);

    expect((await fullFetch.cancel(id)).fetch).toBeNull();
    expect(await failsWith(fullFetch.cancel(id))).toBe(409);

    const done = await insertNovel(db, { chapters: 1, fetched: [1] });
    expect(await failsWith(fullFetch.start(done.id))).toBe(409);
  });
});

describe('EPUB import, export and novel management', () => {
  it('imports an EPUB with its cover, exports it and manages it', async () => {
    const importer = createEpubImportService(db);
    const file = { name: 'courier.epub', bytes: sampleEpub({ cover: png() }) };
    const imported = await importer.importEpub(file);
    expect(imported.status).toBe(201);
    const { novel } = imported.body;
    expect(novel).toMatchObject({ title: 'The Lantern Courier', totalChapters: 3 });
    expect(novel.coverUrl).toMatch(new RegExp(`^/covers/${novel.id}\\?v=`));
    expect(imported.body.wordCount).toBeGreaterThan(0);
    expect(await failsWith(importer.importEpub(file))).toBe(409);

    const exported = await createEpubExportService(db).exportNovel(novel.id);
    const chunks: Uint8Array[] = [];
    for await (const chunk of exported.content) chunks.push(chunk);
    const zip = Buffer.concat(chunks);
    expect(zip.subarray(0, 2).toString()).toBe('PK');
    expect(zip.includes('images/cover.png')).toBe(true);

    const management = createNovelManagementService(db);
    const renamed = await management.updateDetails(novel.id, {
      title: 'Renamed',
      tags: ['Mystery'],
    });
    expect(renamed).toMatchObject({ title: 'Renamed', tags: ['Mystery'] });
    const recovered = await management.replaceCover(novel.id, png(2, 2));
    expect(recovered.coverUrl).not.toBe(novel.coverUrl);
    expect(await failsWith(management.replaceCover(novel.id, Buffer.from('not an image')))).toBe(
      400,
    );

    await management.deleteNovel(novel.id);
    const left = await db.query<{ n: number }>(
      'SELECT (SELECT count(*) FROM chapters) + (SELECT count(*) FROM covers) AS n',
    );
    expect(left.rows[0]?.n).toBe(0);
    expect(await failsWith(management.deleteNovel(novel.id))).toBe(404);
  });
});
