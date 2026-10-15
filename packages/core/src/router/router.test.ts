import { nodeSqliteDriver } from '@webnovel-hub/platform-node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { insertNovel } from '../../test/catalog.js';
import { addSource } from '../../test/database.js';
import { png, sampleEpub } from '../../test/epub.js';
import { type Core, createCore } from '../core.js';
import type { CoreRequest, CoreResponse } from './router.js';

let core: Core;

beforeEach(async () => {
  core = await createCore({ driver: nodeSqliteDriver(':memory:') });
  await addSource(core.db);
});
afterEach(() => core.close());

const call = (request: CoreRequest) => core.dispatch(request);
const get = (path: string) => call({ method: 'GET', path });

/** The envelope of a JSON response. */
function body(response: CoreResponse) {
  if (!('body' in response)) throw new Error('expected a JSON response, got a file');
  return response.body;
}

describe('routing', () => {
  it('answers in the envelope with the REST statuses', async () => {
    const { id } = await insertNovel(core.db, { chapters: 3, fetched: [1] });
    const novel = await get(`/novels/${id}`);
    expect(novel.status).toBe(200);
    expect(body(novel)).toMatchObject({ success: true, error: null, data: { novel: { id } } });

    expect((await get(`/reader/${id}/chapters/1`)).status).toBe(200);
    expect((await get(`/reader/${id}/chapters/2`)).status).toBe(202);
    expect((await get(`/reader/${id}/chapters/0`)).status).toBe(400);
  });

  it('prefers fixed segments over parameters', async () => {
    const stats = await get('/library/stats');
    expect(body(stats)).toMatchObject({ success: true, data: { total: 0 } });
  });

  it('answers unknown paths, methods and malformed ids with a 404', async () => {
    expect(await get('/nowhere')).toEqual({
      status: 404,
      body: { success: false, data: null, error: 'Not found.' },
    });
    expect((await call({ method: 'PUT', path: '/library' })).status).toBe(404);
    expect(body(await get('/novels/not-an-id'))).toMatchObject({ error: 'Novel not found.' });
  });

  it('validates queries and bodies with messages for the reader', async () => {
    expect(body(await get('/library?sort=sideways'))).toMatchObject({
      success: false,
      error: 'sort must be one of last_read, last_updated, title, added, progress.',
    });
    expect(body(await get('/search?q=a'))).toMatchObject({
      error: 'Type at least 2 characters to search.',
    });
    const preferences = await call({
      method: 'PATCH',
      path: '/user/preferences',
      body: { fontSize: 99 },
    });
    expect(preferences.status).toBe(400);
    const unknown = await call({
      method: 'PATCH',
      path: '/user/preferences',
      body: { timezone: 'UTC' },
    });
    expect(body(unknown)).toMatchObject({ error: 'Unknown preference: timezone.' });
    const saved = await call({
      method: 'PATCH',
      path: '/user/preferences',
      body: { lineSpacing: 1.8 },
    });
    expect(body(saved)).toMatchObject({ data: { preferences: { lineSpacing: 1.8 } } });
  });

  it('adds, changes and deletes terms, checking their text', async () => {
    const { id } = await insertNovel(core.db);
    const post = (body: unknown) => call({ method: 'POST', path: '/terms', body });

    const created = await post({
      novelId: id.toUpperCase(),
      original: ' Lin ',
      replacement: 'Lyn',
    });
    expect(created.status).toBe(201);
    const term = (body(created).data as { term: { id: string } }).term;
    expect(body(created).data).toMatchObject({ term: { novel: { id }, original: 'Lin' } });
    expect(body(await get(`/novels/${id}/terms`)).data).toMatchObject({ terms: [{ id: term.id }] });

    expect(body(await post({ novelId: null, original: '  ', replacement: 'x' })).error).toBe(
      'Enter the text to replace.',
    );
    expect(body(await post({ novelId: 'n1', original: 'a', replacement: 'b' })).error).toBe(
      'novelId must be a novel id, or null for every novel.',
    );
    expect(
      body(await post({ novelId: null, original: 'a', replacement: 'b', regex: true })).error,
    ).toBe('A term has only a novelId, an original and a replacement (not: regex).');

    const patch = (changes: unknown) =>
      call({ method: 'PATCH', path: `/terms/${term.id}`, body: changes });
    expect(body(await patch({})).error).toBe(
      'Change at least one of the novel, the original or the replacement.',
    );
    expect(body(await patch({ replacement: 'Lynn' })).data).toMatchObject({
      term: { replacement: 'Lynn' },
    });
    expect((await call({ method: 'DELETE', path: `/terms/${term.id}` })).status).toBe(200);
    expect(body(await call({ method: 'DELETE', path: `/terms/${term.id}` })).error).toBe(
      'This term no longer exists.',
    );
  });

  it('makes shelves, puts novels on them, and hides novels', async () => {
    const { id } = await insertNovel(core.db, { title: 'Alpha' });
    const created = await call({ method: 'POST', path: '/shelves', body: { name: ' ✨ Comfy ' } });
    expect(created.status).toBe(201);
    const shelf = (body(created).data as { shelf: { id: string } }).shelf;
    expect(body(created).data).toMatchObject({ shelf: { name: '✨ Comfy', novels: 0 } });
    expect(body(await call({ method: 'POST', path: '/shelves', body: { name: '' } })).error).toBe(
      'Give the shelf a name of up to 40 characters.',
    );

    const put = await call({
      method: 'PUT',
      path: `/library/${id}/shelves`,
      body: { shelfIds: [shelf.id] },
    });
    expect(body(put).data).toMatchObject({ item: { library: { shelfIds: [shelf.id] } } });
    expect(body(await get(`/library?shelf=${shelf.id}`)).data).toMatchObject({ total: 1 });

    await call({ method: 'PATCH', path: `/library/${id}/hidden`, body: { hidden: true } });
    expect(body(await get('/library')).data).toMatchObject({ total: 0 });
    expect(body(await get('/library?shelf=hidden')).data).toMatchObject({ total: 1 });
    expect(body(await get('/shelves')).data).toMatchObject({ shelves: [{ novels: 0 }] });

    expect((await call({ method: 'DELETE', path: `/shelves/${shelf.id}` })).status).toBe(200);
    expect(body(await call({ method: 'DELETE', path: `/shelves/${shelf.id}` })).error).toBe(
      'This shelf no longer exists.',
    );
  });

  it('decodes parameters and keeps query values as text', async () => {
    const { id } = await insertNovel(core.db, { title: 'Ünïcode Tale', chapters: 12 });
    const page = await get(
      `/novels/${id}/chapters?order=desc&limit=5&q=${encodeURIComponent('part 1')}`,
    );
    expect(body(page)).toMatchObject({
      success: true,
      data: { total: 4, order: 'desc', limit: 5 },
    });
    const found = await get(`/search?q=${encodeURIComponent('ünïcode')}`);
    expect(body(found)).toMatchObject({ data: { total: 1 } });
  });
});

describe('files', () => {
  it('imports an EPUB, serves its cover and exports it', async () => {
    const bytes = sampleEpub({ cover: png() });
    const imported = await call({
      method: 'POST',
      path: '/import/epub',
      file: { name: 'courier.epub', type: 'application/epub+zip', bytes },
    });
    expect(imported.status).toBe(201);
    const { novel } = body(imported).data as { novel: { id: string; coverUrl: string } };

    const cover = await get(novel.coverUrl);
    expect(cover).toMatchObject({ status: 200, file: { mediaType: 'image/png', name: null } });

    const epub = await get(`/novels/${novel.id}/epub`);
    expect(epub).toMatchObject({
      status: 200,
      file: { mediaType: 'application/epub+zip', name: 'The Lantern Courier.epub' },
    });
    if (!('file' in epub)) throw new Error('expected a file');
    expect(Array.from(epub.file.bytes.subarray(0, 2))).toEqual([0x50, 0x4b]);
  });

  it('checks an EPUB upload before opening it', async () => {
    const upload = (name: string, type: string, bytes: Uint8Array) =>
      call({ method: 'POST', path: '/import/epub', file: { name, type, bytes } });
    expect(body(await call({ method: 'POST', path: '/import/epub' }))).toMatchObject({
      error: 'Choose an EPUB file to import.',
    });
    expect(body(await upload('book.pdf', '', sampleEpub()))).toMatchObject({
      error: 'Choose an EPUB file: its name ends in .epub.',
    });
    expect(body(await upload('book.epub', 'text/plain', sampleEpub()))).toMatchObject({
      error: "This file isn't an EPUB.",
    });
    expect(body(await upload('book.epub', '', new Uint8Array([1, 2, 3, 4])))).toMatchObject({
      error: "This file isn't a valid EPUB: it isn't a ZIP archive.",
    });
  });

  it('replaces a cover with an uploaded image', async () => {
    const { id } = await insertNovel(core.db, { chapters: 1 });
    const replaced = await call({
      method: 'POST',
      path: `/novels/${id}/cover`,
      file: { name: 'cover.png', type: 'image/png', bytes: png() },
    });
    expect(body(replaced)).toMatchObject({ success: true, data: { novel: { id } } });
    const wrong = await call({
      method: 'POST',
      path: `/novels/${id}/cover`,
      file: { name: 'cover.gif', type: 'image/gif', bytes: png() },
    });
    expect(body(wrong)).toMatchObject({ error: 'Choose a JPG, PNG or WebP image.' });
    expect((await get(`/covers/${crypto.randomUUID()}`)).status).toBe(404);
  });
});
