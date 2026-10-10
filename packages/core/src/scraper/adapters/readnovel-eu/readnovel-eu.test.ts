import { describe, expect, it } from 'vitest';
import { FakeSite } from '../../../../test/sites.js';
import { htmlToText } from '../../../epub/normalize.js';
import { StructureChanged, UnsupportedUrl } from '../../errors.js';
import { ReadNovelEuAdapter } from './index.js';

const adapter = new ReadNovelEuAdapter();

const NOVEL = 'https://readnovel.eu/novel/the-bronze-garden';
const chapter = (n: number) => `https://readnovel.eu/chapter/the-bronze-garden-${n}`;

/** A page as the site serves it: its data in a Next.js script. */
const page = (pageProps: unknown) => ({
  body:
    '<html><body><div id="__next"></div><script id="__NEXT_DATA__" type="application/json">' +
    `${JSON.stringify({ props: { pageProps }, page: '/novel/[slug]' })}</script></body></html>`,
});

const novel = {
  id: 7,
  slug: 'the-bronze-garden',
  title: 'The Bronze  Garden',
  description: 'A gardener grows bronze roses.\n\nThey never wilt.',
  author: { name: 'Lu Wen', slug: 'lu-wen' },
  genres: [{ name: 'Fantasy' }, { name: 'Drama' }],
  tags: [{ name: 'Weak to Strong' }],
  coverKey: 'covers/v1/abc123',
  coverOriginal: 'original/The-Bronze-Garden.png',
};

const ranges = [
  { page: 1, from: 1, to: 100 },
  { page: 2, from: 101, to: 200 },
];
const item = (number: number, title: string) => ({
  number,
  title,
  createdAt: `2025-03-0${number % 9 || 1}T10:00:00.000Z`,
});

const site = () =>
  new FakeSite()
    .add(
      NOVEL,
      page({
        novel,
        toc: { items: [item(1, 'Chapter 1 - Cuttings'), item(2, 'Chapter 2 - Patina')], ranges },
      }),
    )
    .add(
      `${NOVEL}?page=2`,
      page({ novel, toc: { items: [item(101, 'Chapter 101 - Bloom')], ranges } }),
    )
    .add(
      chapter(2),
      page({
        data: {
          chapter: {
            number: 2,
            title: 'Chapter 2 - Patina',
            paragraphs: ['Chapter 2: Patina', 'The roses turned green & proud.', '', 'Lu smiled.'],
          },
        },
      }),
    );

describe('ReadNovel.eu', () => {
  it.each([
    NOVEL,
    chapter(12),
    'https://wuxiaworld.eu/novel/the-bronze-garden',
    'https://www.wuxia.click/chapter/the-bronze-garden-1/',
  ])('leads %s to the novel page', (url) => {
    expect(adapter.canonicalize(url)).toBe(NOVEL);
  });

  it('keeps a slug that ends in a number', () => {
    expect(adapter.canonicalize('https://readnovel.eu/chapter/volume-2-3')).toBe(
      'https://readnovel.eu/novel/volume-2',
    );
  });

  it.each(['https://readnovel.eu/', 'https://readnovel.eu/search?q=x'])(
    'does not take %s for a novel',
    (url) => {
      expect(() => adapter.canonicalize(url)).toThrow(UnsupportedUrl);
    },
  );

  it('reads the novel from its page data', async () => {
    expect(await adapter.fetchNovel(site().session(), NOVEL)).toEqual({
      title: 'The Bronze Garden',
      author: 'Lu Wen',
      description: 'A gardener grows bronze roses.\n\nThey never wilt.',
      tags: ['Fantasy', 'Drama'],
      coverUrl: 'https://cdn.wuxiaworld.eu/covers/v1/abc123-480.webp',
    });
  });

  it('reads every page of the chapter list, asking once for the first', async () => {
    const fake = site();
    const session = fake.session();
    await adapter.fetchNovel(session, NOVEL);
    const chapters = await adapter.fetchChapterList(session, chapter(2));
    expect(chapters.map((c) => [c.title, c.url])).toEqual([
      ['Chapter 1 - Cuttings', chapter(1)],
      ['Chapter 2 - Patina', chapter(2)],
      ['Chapter 101 - Bloom', chapter(101)],
    ]);
    expect(chapters[0]!.publishedAt?.toISOString()).toBe('2025-03-01T10:00:00.000Z');
    expect(fake.requests.get(NOVEL)).toBe(1);
  });

  it('reads the chapter text from its paragraphs', async () => {
    const result = await adapter.fetchChapter(site().session(), {
      url: chapter(2),
      title: 'x',
      publishedAt: null,
    });
    expect(result.title).toBe('Chapter 2 - Patina');
    expect(htmlToText(result.html)).toBe(
      'Chapter 2: Patina\n\nThe roses turned green & proud.\n\nLu smiled.',
    );
  });

  it('reports a page without its data as a layout change', async () => {
    const fake = site().add(NOVEL, { body: '<html><body>Maintenance</body></html>' });
    await expect(adapter.fetchNovel(fake.session(), NOVEL)).rejects.toThrow(StructureChanged);
  });
});
