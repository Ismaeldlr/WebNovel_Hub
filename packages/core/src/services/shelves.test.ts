import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { insertNovel } from '../../test/catalog.js';
import { addSource, openTestDatabase } from '../../test/database.js';
import type { Database } from '../db/database.js';
import { AppError } from '../errors.js';
import { searchCatalog } from '../repositories/catalog.js';
import { newChaptersCount } from '../repositories/library.js';
import { novelsToAnnounce } from '../repositories/notifications.js';
import { createLibraryService } from './library.js';
import { createShelfService } from './shelves.js';

let db: Database;

beforeEach(async () => {
  db = await openTestDatabase();
  await addSource(db, 'royal_road', 'Royal Road');
});
afterEach(() => db.close());

async function failsWith(promise: Promise<unknown>): Promise<number> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(error instanceof AppError)) throw new Error(`expected an AppError, got ${String(error)}`);
  return error.status;
}

const list = (library: ReturnType<typeof createLibraryService>, shelf: string | null) =>
  library
    .list({
      status: null,
      source: null,
      favorite: null,
      unread: null,
      tag: null,
      shelf,
      q: null,
      sort: 'title',
      page: 1,
      limit: 10,
    })
    .then((page) => page.items.map((item) => item.novel.title));

describe('shelves', () => {
  it('are made, renamed, put in order and deleted, names unique whatever the case', async () => {
    const shelves = createShelfService(db);
    const isekai = await shelves.create('Isekai');
    const later = await shelves.create('📚 Binge later');
    expect((await shelves.list()).map((shelf) => shelf.name)).toEqual(['Isekai', '📚 Binge later']);

    expect(await failsWith(shelves.create('isekai'))).toBe(409);
    expect((await shelves.rename(isekai.id, 'Isekai & co')).name).toBe('Isekai & co');
    expect(await failsWith(shelves.rename(isekai.id, '📚 BINGE LATER'))).toBe(409);

    expect((await shelves.reorder([later.id, isekai.id])).map((shelf) => shelf.id)).toEqual([
      later.id,
      isekai.id,
    ]);
    // A new shelf goes last.
    await shelves.create('Done');
    expect((await shelves.list()).map((shelf) => shelf.name)).toEqual([
      '📚 Binge later',
      'Isekai & co',
      'Done',
    ]);

    await shelves.remove(later.id);
    expect(await failsWith(shelves.remove(later.id))).toBe(404);
    expect(await failsWith(shelves.rename(later.id, 'Back'))).toBe(404);
  });

  it('hold novels, each on any number of them; deleting a shelf keeps its novels', async () => {
    const shelves = createShelfService(db);
    const library = createLibraryService(db);
    const a = await insertNovel(db, { title: 'Alpha' });
    await insertNovel(db, { title: 'Beta' });
    const fantasy = await shelves.create('Fantasy');
    const favourites = await shelves.create('Re-reads');

    const item = await library.setShelves(a.id, [fantasy.id, favourites.id, fantasy.id]);
    expect(item.library.shelfIds.sort()).toEqual([fantasy.id, favourites.id].sort());
    expect(await list(library, fantasy.id)).toEqual(['Alpha']);
    expect((await shelves.list()).map((shelf) => shelf.novels)).toEqual([1, 1]);

    // Exactly the shelves sent: off one, still on the other.
    await library.setShelves(a.id, [favourites.id]);
    expect(await list(library, fantasy.id)).toEqual([]);
    expect(await list(library, favourites.id)).toEqual(['Alpha']);

    expect(
      await failsWith(library.setShelves(a.id, ['00000000-0000-4000-8000-000000000000'])),
    ).toBe(404);
    await shelves.remove(favourites.id);
    expect(await list(library, null)).toEqual(['Alpha', 'Beta']);
    expect((await library.list({ ...base(), shelf: null })).items[0]?.library.shelfIds).toEqual([]);
  });

  it('keep hidden novels out of every list, count and search, but not off their shelves', async () => {
    const shelves = createShelfService(db);
    const library = createLibraryService(db);
    const shown = await insertNovel(db, { title: 'Shown Saga' });
    const secret = await insertNovel(db, { title: 'Secret Saga' });
    const shelf = await shelves.create('Sagas');
    await library.setShelves(shown.id, [shelf.id]);
    await library.setShelves(secret.id, [shelf.id]);
    await db.query('INSERT INTO new_chapters (chapter_id, novel_id) VALUES ($1, $2)', [
      secret.chapterIds[0],
      secret.id,
    ]);

    expect((await library.setHidden(secret.id, true)).library.hidden).toBe(true);
    expect(await list(library, null)).toEqual(['Shown Saga']);
    expect(await list(library, shelf.id)).toEqual(['Shown Saga']);
    expect(await list(library, 'hidden')).toEqual(['Secret Saga']);
    expect((await shelves.list())[0]?.novels).toBe(1);
    expect(await library.stats()).toMatchObject({ total: 1, hidden: 1, newChapters: 0 });
    expect(await newChaptersCount(db)).toBe(0);
    const search = await searchCatalog(db, { q: 'saga', limit: 5 });
    expect(search.results.map((result) => result.novel.title)).toEqual(['Shown Saga']);

    // Shown again: back everywhere, still on its shelf.
    await library.setHidden(secret.id, false);
    expect(await list(library, shelf.id)).toEqual(['Secret Saga', 'Shown Saga']);
    expect(await newChaptersCount(db)).toBe(1);
  });

  it('quiet a hidden novel, unless the reader turns its notifications on again', async () => {
    const library = createLibraryService(db);
    const a = await insertNovel(db, { title: 'Alpha' });
    const b = await insertNovel(db, { title: 'Beta' });
    await library.setNotify(b.id, true);
    const announced = () => novelsToAnnounce(db, [a.id, b.id], 'following');
    expect(await announced()).toEqual(new Set([a.id, b.id]));

    await library.setHidden(a.id, true);
    // Hiding drops an "always" choice too.
    expect((await library.setHidden(b.id, true)).library.notify).toBeNull();
    expect(await announced()).toEqual(new Set());

    await library.setNotify(b.id, true);
    expect(await announced()).toEqual(new Set([b.id]));
  });
});

function base() {
  return {
    status: null,
    source: null,
    favorite: null,
    unread: null,
    tag: null,
    q: null,
    sort: 'title' as const,
    page: 1,
    limit: 10,
  };
}
