// Imports and reading through the app, with the job runner fetching from saved pages.
import { nodeSqliteDriver } from '@webnovel-hub/platform-node';
import type {
  ChapterPage,
  ImportUrlResponse,
  IngestionJob,
  Job,
  NovelDetail,
  ReaderChapterResponse,
  SourcesResponse,
} from '@webnovel-hub/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeSite, JPEG, hasFixtures } from '../../test/sites.js';
import { type Core, createCore } from '../core.js';
import type { CoreRequest } from '../router/router.js';

const FICTION = 'https://www.royalroad.com/fiction/98765';
const CHAPTER = 'https://www.royalroad.com/fiction/98765/the-clockwork-ferry/chapter';
const COVER =
  'https://www.royalroadcdn.com/public/covers-full/98765-the-clockwork-ferry.jpg?time=1709300000';

let site: FakeSite;
let core: Core;

async function call<T>(request: CoreRequest): Promise<{ status: number; data: T }> {
  const response = await core.dispatch(request);
  if (!('body' in response)) throw new Error('expected a JSON response');
  return { status: response.status, data: response.body.data as T };
}

/** The job once it has finished. */
function finished(jobId: string): Promise<Job> {
  return vi.waitFor(
    async () => {
      const { data } = await call<{ job: Job }>({ method: 'GET', path: `/jobs/${jobId}` });
      if (data.job.status !== 'completed' && data.job.status !== 'failed')
        throw new Error('still running');
      return data.job;
    },
    { timeout: 5_000, interval: 10 },
  );
}

async function importNovel(url = `${FICTION}/the-clockwork-ferry`): Promise<IngestionJob> {
  const { data } = await call<ImportUrlResponse>({
    method: 'POST',
    path: '/import/url',
    body: { url },
  });
  return (await finished(data.jobId)) as IngestionJob;
}

beforeEach(async () => {
  site = new FakeSite()
    .addFixture(FICTION, 'royal_road/fiction.html')
    .addFixture(`${CHAPTER}/1002/2-the-brass-pilot`, 'royal_road/chapter.html')
    .add(COVER, { body: JPEG, contentType: 'image/jpeg' });
  core = await createCore({
    driver: nodeSqliteDriver(':memory:'),
    http: site,
    requestDelay: 0,
    maxRetries: 0,
  });
  await core.runner!.start();
});
afterEach(() => core.close());

describe.skipIf(!hasFixtures)('importing and reading', () => {
  it('imports a novel with its chapter list and cover', async () => {
    const job = await importNovel();
    expect(job).toMatchObject({
      status: 'completed',
      progressPercent: 100,
      source: { key: 'royal_road', name: 'Royal Road' },
      result: { title: 'The Clockwork Ferry', chapterCount: 4, duplicate: false },
    });

    const { data } = await call<{ novel: NovelDetail }>({
      method: 'GET',
      path: `/novels/${job.result!.novelId}`,
    });
    expect(data.novel).toMatchObject({
      title: 'The Clockwork Ferry',
      author: 'wren_h',
      sourceUrl: FICTION,
      totalChapters: 4,
      tags: ['Adventure', 'Steampunk', 'Slice of Life'],
    });
    expect(data.novel.coverUrl).toMatch(/^\/covers\//);
    const cover = await core.dispatch({ method: 'GET', path: data.novel.coverUrl! });
    expect('file' in cover && cover.file.mediaType).toBe('image/jpeg');
  });

  it('fetches a chapter when the reader opens it', async () => {
    const { result } = await importNovel();
    const path = `/reader/${result!.novelId}/chapters/2`;
    const opened = await call<ReaderChapterResponse>({ method: 'GET', path });
    expect(opened.status).toBe(202);
    if (opened.data.status !== 'fetching') throw new Error('expected the chapter to be fetching');
    await finished(opened.data.jobId);

    const ready = await call<ReaderChapterResponse>({ method: 'GET', path });
    expect(ready.status).toBe(200);
    expect(ready.data).toMatchObject({
      content: expect.stringContaining('The pilot was made of brass'),
    });
    expect(site.requests.get(`${CHAPTER}/1002/2-the-brass-pilot`)).toBe(1);
  });

  it('reports a second import of the same novel as a duplicate', async () => {
    const first = await importNovel();
    // Stored under its canonical address, so another address of it is caught by the job.
    const second = await importNovel('http://royalroad.com/fiction/98765/');
    expect(second.result).toMatchObject({ novelId: first.result!.novelId, duplicate: true });
    expect(site.requests.get(FICTION)).toBe(1);
  });

  it('fails the import of a page that is not a novel, saying why', async () => {
    const job = await importNovel('https://www.royalroad.com/fictions/best-rated');
    expect(job.status).toBe('failed');
    expect(job.error).toEqual({
      type: 'unknown',
      message: expect.stringContaining('fiction page'),
    });
  });

  it('fails a chapter that cannot be fetched, and records it on the chapter', async () => {
    const { result } = await importNovel();
    const novelId = result!.novelId;
    const opened = await call<ReaderChapterResponse>({
      method: 'GET',
      path: `/reader/${novelId}/chapters/1`,
    });
    if (opened.data.status !== 'fetching') throw new Error('expected the chapter to be fetching');
    expect((await finished(opened.data.jobId)).status).toBe('failed');
    const chapters = await call<ChapterPage>({
      method: 'GET',
      path: `/novels/${novelId}/chapters`,
    });
    expect(chapters.data.chapters[0]).toMatchObject({
      number: 1,
      isFetched: false,
      fetchFailure: { type: 'unknown' },
    });
  });
});

describe('the site list', () => {
  it('offers every supported site for import', async () => {
    const { data } = await call<SourcesResponse>({ method: 'GET', path: '/sources' });
    const importable = data.sources.filter((source) => source.importable);
    expect(importable).toHaveLength(18);
    expect(importable.map((source) => source.key)).toContain('royal_road');
    expect(importable.filter((source) => source.inProgress)).toEqual([]);
  });
});
