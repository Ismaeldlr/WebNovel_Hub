import { describe, expect, it } from 'vitest';
import { FakeSite, WEBP, fixture, hasFixtures } from '../../../../test/sites.js';
import { htmlToText } from '../../../epub/normalize.js';
import { UnsupportedUrl } from '../../errors.js';
import { RanobesAdapter } from './index.js';

const adapter = new RanobesAdapter();

const INDEX = 'https://ranobes.net/chapters/424242/';
const NOVEL = 'https://ranobes.net/novels/424242-the-lantern-sect.html';
const chapter = (id: number) => `https://ranobes.net/the-lantern-sect-424242/${id}.html`;
const COVER = 'https://ranobes.net/uploads/posts/2026-01/1_the-lantern-sect.webp';

/** Pages load in the web view (past DDoS-Guard's check); only the cover is plain HTTP. */
const site = () =>
  rendered(new FakeSite().add(COVER, { body: WEBP, contentType: 'image/webp' }), {
    [INDEX]: fixture('ranobes/index-1.html'),
    [`${INDEX}page/2/`]: fixture('ranobes/index-2.html'),
    [NOVEL]: fixture('ranobes/novel.html'),
    [chapter(900002)]: fixture('ranobes/chapter.html'),
  });

function rendered(fake: FakeSite, pages: Record<string, string>): FakeSite {
  for (const [url, html] of Object.entries(pages)) fake.rendered.set(url, html);
  return fake;
}

describe('Ranobes addresses', () => {
  it.each([
    NOVEL,
    'https://ranobes.net/novels/424242.html',
    'https://ranobes.net/chapters/424242/',
    'https://ranobes.net/chapters/424242/page/3/',
    'https://ranobes.net/the-lantern-sect-424242/900002.html',
    'https://ranobes.top/novels/424242-the-lantern-sect.html',
    'http://www.ranobes.net/chapters/424242',
  ])('leads %s to the chapter index', (url) => {
    expect(adapter.canonicalize(url)).toBe(INDEX);
  });

  it.each([
    'https://ranobes.net/',
    'https://ranobes.net/tags/genre/xianxia/',
    'https://ranobes.net/novels/',
  ])('does not take %s for a novel', (url) => {
    expect(() => adapter.canonicalize(url)).toThrow(UnsupportedUrl);
  });

  it('identifies chapters by their id, whatever the novel slug', () => {
    expect(adapter.chapterKey(chapter(900002))).toBe('chapter/900002');
    expect(adapter.chapterKey('https://ranobes.net/renamed-424242/900002.html')).toBe(
      'chapter/900002',
    );
  });
});

describe.skipIf(!hasFixtures)('Ranobes pages', () => {
  it('reads the novel page the index links to', async () => {
    expect(await adapter.fetchNovel(site().session(), INDEX)).toEqual({
      title: 'The Lantern Sect',
      author: 'Mo Qinghe',
      description:
        'A disciple who tends the lamps of a forgotten sect.\n\n' +
        'When the last lantern goes out, “the sect will fall.”\nUpdated daily.',
      tags: ['Xianxia', 'Mystery'],
      coverUrl: COVER,
    });
  });

  it('falls back to the heading for the title', async () => {
    const page = fixture('ranobes/novel.html');
    const start = page.indexOf('<script type="application/ld+json">');
    const end = page.indexOf('</script>', start) + '</script>'.length;
    const fake = rendered(site(), { [NOVEL]: page.slice(0, start) + page.slice(end) });
    const meta = await adapter.fetchNovel(fake.session(), INDEX);
    expect(meta.title).toBe('The Lantern Sect'); // without the original-language subtitle
    expect(meta.coverUrl).toBe(COVER); // from og:image
  });

  it('reads every index page, in reading order', async () => {
    const fake = site();
    const session = fake.session();
    await adapter.fetchNovel(session, INDEX);
    const chapters = await adapter.fetchChapterList(session, INDEX);
    expect(chapters.map((c) => c.title)).toEqual([
      'Chapter 1: The Unlit Hall',
      'Chapter 2: Oil and Ash',
      'Chapter 3: A Wick of Silver', // listed on both pages, kept once
      'Chapter 4: The Keeper’s Test',
      'Chapter 5: Dawn Over the Sect',
    ]);
    expect(chapters[0]!.url).toBe(chapter(900001));
    expect(chapters[0]!.publishedAt?.toISOString()).toBe('2026-01-05T08:00:00.000Z');
    expect(fake.renders.get(INDEX)).toBe(1); // page 1 served both steps
    expect(fake.renders.get(`${INDEX}page/2/`)).toBe(1);
    expect(fake.requests.get(INDEX)).toBeUndefined(); // never plain HTTP
  });

  it('reads the chapter text without ad slots', async () => {
    const page = await adapter.fetchChapter(site().session(), {
      url: chapter(900002),
      title: 'x',
      publishedAt: null,
    });
    expect(page.title).toBe('Chapter 2: Oil and Ash');
    expect(htmlToText(page.html)).toBe(
      'The oil store was empty again.\n\n' +
        'Lin Qiu swept the ash into a jar & labelled it.\n\n' +
        '“Waste nothing,” the elder had said.\nSo she wasted nothing.\n\n' +
        'By nightfall, the first lantern was lit.',
    );
  });

  it('reports a missing index as a layout change', async () => {
    const fake = rendered(site(), {
      [INDEX]: '<html><body><div id="dle-content">Table of contents</div></body></html>',
    });
    await expect(adapter.fetchChapterList(fake.session(), INDEX)).rejects.toThrow(/__DATA__/);
  });

  it('reports a missing chapter body as a layout change', async () => {
    const fake = rendered(site(), {
      [chapter(900002)]: fixture('ranobes/chapter.html').replace('id="arrticle"', 'id="text"'),
    });
    await expect(
      adapter.fetchChapter(fake.session(), { url: chapter(900002), title: 'x', publishedAt: null }),
    ).rejects.toThrow(/chapter text/);
  });
});
