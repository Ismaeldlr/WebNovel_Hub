import { describe, expect, it } from 'vitest';
import { FakeSite, JPEG, fixture, hasFixtures } from '../../../../test/sites.js';
import { htmlToText } from '../../../epub/normalize.js';
import { UnsupportedUrl } from '../../errors.js';
import { FanMtlAdapter, WuxiaBoxAdapter, WuxiaSpotAdapter } from './index.js';

const adapter = new WuxiaBoxAdapter();

const NOVEL = 'https://www.wuxiabox.com/novel/the-copper-sect.html';
const index = (page: number) =>
  `https://www.wuxiabox.com/e/extend/fy.php?page=${page}&wjm=the-copper-sect`;
const chapter = (n: number) => `https://www.wuxiabox.com/novel/the-copper-sect_${n}.html`;
const COVER = 'https://www.wuxiabox.com/d/file/p/copper-sect.jpg';

function site() {
  const fake = new FakeSite().addFixture(NOVEL, 'readwn/novel.html');
  for (const page of [0, 1, 2]) fake.addFixture(index(page), `readwn/index-${page}.html`);
  return fake
    .addFixture(chapter(2), 'readwn/chapter.html')
    .add(COVER, { body: JPEG, contentType: 'image/jpeg' });
}

describe('Readwn addresses', () => {
  it.each([
    NOVEL,
    chapter(2),
    'http://wuxiabox.com/novel/the-copper-sect.html',
    'https://www.wuxiabox.com/novel/the-copper-sect_1200.html?from=list#c',
  ])('leads %s to the novel page', (url) => {
    expect(adapter.canonicalize(url)).toBe(NOVEL);
  });

  it('keeps each site on its own domain', () => {
    expect(new FanMtlAdapter().canonicalize('https://fanmtl.com/novel/ke383028_5.html')).toBe(
      'https://www.fanmtl.com/novel/ke383028.html',
    );
    expect(new WuxiaSpotAdapter().canonicalize('https://wuxiaspot.com/novel/6946332.html')).toBe(
      'https://www.wuxiaspot.com/novel/6946332.html',
    );
  });

  it.each(['https://www.wuxiabox.com/', 'https://www.wuxiabox.com/list/fantasy/all.html'])(
    'does not take %s for a novel',
    (url) => {
      expect(() => adapter.canonicalize(url)).toThrow(UnsupportedUrl);
    },
  );
});

describe.skipIf(!hasFixtures)('Readwn pages', () => {
  it('reads the novel page', async () => {
    expect(await adapter.fetchNovel(site().session(), NOVEL)).toEqual({
      title: 'The Copper Sect',
      author: 'Hu Tieshan',
      description: "An apprentice polishes the sect's copper bell.\n\nOne day it rings by itself.",
      tags: ['Xianxia', 'Comedy'],
      coverUrl: COVER,
    });
  });

  it('reads index pages until one is empty', async () => {
    const fake = site();
    const chapters = await adapter.fetchChapterList(fake.session(), NOVEL);
    expect(chapters.map((c) => c.title)).toEqual([
      'Chapter 1 The Green Bell',
      'Chapter 2 Verdigris',
      'Chapter 3 The Bell Rings Alone',
    ]);
    expect(chapters[1]!.url).toBe(chapter(2));
    expect(fake.requests.get(index(2))).toBe(1);
    expect(fake.requests.get(index(3))).toBeUndefined();
  });

  it('stops at a page that repeats the last one', async () => {
    const fake = site().add(index(2), { body: fixture('readwn/index-1.html') });
    expect(await adapter.fetchChapterList(fake.session(), NOVEL)).toHaveLength(3);
  });

  it('reads the chapter text without ad boxes', async () => {
    const page = await adapter.fetchChapter(site().session(), {
      url: chapter(2),
      title: 'x',
      publishedAt: null,
    });
    expect(page.title).toBe('Chapter 2 Verdigris');
    expect(htmlToText(page.html)).toBe(
      'Chapter 2 Verdigris\nThe bell had turned green overnight.\n\n' +
        'Elder Fang called it rot; the apprentice called it a coat.\n\n' +
        '"Polish it again," Fang said.\n\n(End of this chapter)',
    );
  });

  it('reports an empty first page as a layout change', async () => {
    const fake = site().add(index(0), { body: fixture('readwn/index-2.html') });
    await expect(adapter.fetchChapterList(fake.session(), NOVEL)).rejects.toThrow(/no chapters/);
  });
});
