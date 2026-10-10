import { describe, expect, it } from 'vitest';
import { FakeSite, JPEG, fixture, hasFixtures } from '../../../../test/sites.js';
import { htmlToText } from '../../../epub/normalize.js';
import { UnsupportedUrl } from '../../errors.js';
import { NovelFireAdapter } from './index.js';

const adapter = new NovelFireAdapter();

const NOVEL = 'https://novelfire.net/book/the-salt-road';
const COVER = 'https://novelfire.net/server-1/the-salt-road.jpg';

const site = () =>
  new FakeSite()
    .addFixture(NOVEL, 'novel_fire/novel.html')
    .addFixture(`${NOVEL}/chapters`, 'novel_fire/chapters-1.html')
    .addFixture(`${NOVEL}/chapters?page=2`, 'novel_fire/chapters-2.html')
    .addFixture(`${NOVEL}/chapter-2`, 'novel_fire/chapter.html')
    .add(COVER, { body: JPEG, contentType: 'image/jpeg' });

describe('Novel Fire addresses', () => {
  it.each([
    NOVEL,
    `${NOVEL}/`,
    `${NOVEL}/chapters?page=4`,
    `${NOVEL}/chapter-12`,
    `${NOVEL}/reviews#top`,
    'http://www.novelfire.net/book/the-salt-road',
  ])('leads %s to the novel page', (url) => {
    expect(adapter.canonicalize(url)).toBe(NOVEL);
  });

  it.each(['https://novelfire.net/', 'https://novelfire.net/genre-action/sort-new'])(
    'does not take %s for a novel',
    (url) => {
      expect(() => adapter.canonicalize(url)).toThrow(UnsupportedUrl);
    },
  );
});

describe.skipIf(!hasFixtures)('Novel Fire pages', () => {
  it('reads the novel page', async () => {
    expect(await adapter.fetchNovel(site().session(), NOVEL)).toEqual({
      title: 'The Salt Road',
      author: 'Mara Vell',
      description:
        'A salt trader walks the last caravan road.\n\nEvery inn on it remembers her & her debts.',
      tags: ['Adventure', 'Fantasy'],
      coverUrl: COVER,
    });
  });

  it('reads every index page', async () => {
    const fake = site();
    const chapters = await adapter.fetchChapterList(fake.session(), `${NOVEL}/chapter-3`);
    expect(chapters.map((c) => c.title)).toEqual([
      'Chapter 1 - The Dry Well',
      'Chapter 2 - Ledger of Inns', // on both pages, kept once
      'Chapter 3 - White Horizon',
    ]);
    expect(chapters[0]!.url).toBe(`${NOVEL}/chapter-1`);
    expect(chapters[0]!.publishedAt?.toISOString()).toBe('2026-02-01T09:30:00.000Z');
    expect(chapters[1]!.publishedAt).toBeNull();
    expect(fake.requests.get(`${NOVEL}/chapters?page=2`)).toBe(1);
  });

  it('reads the chapter text without ad slots', async () => {
    const page = await adapter.fetchChapter(site().session(), {
      url: `${NOVEL}/chapter-2`,
      title: 'x',
      publishedAt: null,
    });
    expect(page.title).toBe('Chapter 2 - Ledger of Inns');
    expect(htmlToText(page.html)).toBe(
      'The innkeeper opened a ledger older than the road.\n\n' +
        'Her name was on every page & every page was unpaid.\n\n' +
        '“Salt,” she said, “settles everything.”',
    );
  });

  it('reports an empty index as a layout change', async () => {
    const fake = site().add(`${NOVEL}/chapters`, { body: '<html><body>No chapters</body></html>' });
    await expect(adapter.fetchChapterList(fake.session(), NOVEL)).rejects.toThrow(/no chapters/);
  });

  it('reports a missing chapter body as a layout change', async () => {
    const fake = site().add(`${NOVEL}/chapter-2`, {
      body: fixture('novel_fire/chapter.html').replace('id="content"', 'id="x"'),
    });
    await expect(
      adapter.fetchChapter(fake.session(), {
        url: `${NOVEL}/chapter-2`,
        title: 'x',
        publishedAt: null,
      }),
    ).rejects.toThrow(/chapter text/);
  });
});
