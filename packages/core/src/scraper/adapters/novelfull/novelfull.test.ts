import { describe, expect, it } from 'vitest';
import { FakeSite, JPEG, hasFixtures } from '../../../../test/sites.js';
import { htmlToText } from '../../../epub/normalize.js';
import { UnsupportedUrl } from '../../errors.js';
import type { Adapter, NovelMeta } from '../base.js';
import { NovelPingAdapter, NovgoAdapter, ReadNovelFullAdapter } from './index.js';

interface Case {
  adapter: Adapter;
  site: () => FakeSite;
  novel: string;
  chapter: string;
  otherUrls: string[];
  meta: NovelMeta;
  chapters: string[];
  chapterTitle: string;
  text: string;
}

const RNF_NOVEL = 'https://readnovelfull.com/the-tin-orchard.html';
const RNF_CHAPTER = 'https://readnovelfull.com/the-tin-orchard/chapter-2-rust.html';
const RNF_COVER = 'https://img.readnovelfull.com/thumb/t-300x439/the-tin-orchard.jpg';
const NOVGO_NOVEL = 'https://novgo.net/the-paper-fleet.html';
const NOVGO_CHAPTER = 'https://novgo.net/the-paper-fleet/chapter-2-the-first-fold.html';
const NOVGO_COVER = 'https://novgo.net/uploads/thumbs/the-paper-fleet-small.jpg';
const PING_NOVEL = 'https://novelping.com/book/the-glass-ferry';
const PING_CHAPTER = 'https://novelping.com/book/the-glass-ferry/chapter-2-fog-tolls';
const PING_COVER = 'https://images.novelping.com/novel/the-glass-ferry.jpg';

const image = { body: JPEG, contentType: 'image/jpeg' };

const CASES: Record<string, Case> = {
  read_novel_full: {
    adapter: new ReadNovelFullAdapter(),
    site: () =>
      new FakeSite()
        .addFixture(RNF_NOVEL, 'novelfull/rnf-novel.html')
        .addFixture(
          'https://readnovelfull.com/ajax/chapter-archive?novelId=4242',
          'novelfull/rnf-archive.html',
        )
        .addFixture(RNF_CHAPTER, 'novelfull/rnf-chapter.html')
        .add(RNF_COVER, image),
    novel: RNF_NOVEL,
    chapter: RNF_CHAPTER,
    otherUrls: [
      RNF_CHAPTER,
      'http://www.readnovelfull.com/the-tin-orchard.html',
      'https://readnovelfull.com/the-tin-orchard.html?page=2#list-chapter',
    ],
    meta: {
      title: 'The Tin Orchard',
      author: 'Odile Brass',
      description: 'A clockmaker plants a garden of metal trees.\n\nThey bloom only at midnight.',
      tags: ['Fantasy', 'Slice of Life'],
      coverUrl: RNF_COVER,
    },
    chapters: ['Chapter 1 - Seeds', 'Chapter 2 - Rust', 'Chapter 3 - Midnight Bloom'],
    chapterTitle: 'Chapter 2 - Rust',
    text:
      'Rust came in the third week, like a rumour.\n\n' +
      'The clockmaker oiled every branch & every leaf.\n\nBy morning the orchard ticked.',
  },
  novgo: {
    adapter: new NovgoAdapter(),
    site: () =>
      new FakeSite()
        .addFixture(NOVGO_NOVEL, 'novelfull/novgo-novel.html')
        .addFixture(
          'https://novgo.net/ajax-chapter-option?novelId=358',
          'novelfull/novgo-options.html',
        )
        .addFixture(NOVGO_CHAPTER, 'novelfull/novgo-chapter.html')
        .add(NOVGO_COVER, image),
    novel: NOVGO_NOVEL,
    chapter: NOVGO_CHAPTER,
    otherUrls: [NOVGO_CHAPTER, 'https://allnovelfull.net/the-paper-fleet.html'],
    meta: {
      title: 'The Paper Fleet',
      author: 'Ilse Marrow',
      description: 'Admiral Wen folds a navy out of old letters.\n\nThe sea reads every one.',
      tags: ['Adventure', 'Mystery'],
      coverUrl: NOVGO_COVER,
    },
    chapters: ['Chapter 1', 'Chapter 2', 'Chapter 3'],
    chapterTitle: 'Chapter 2',
    text:
      'Chapter 2: The First Fold\n\nWen creased the first letter along its old fold.\n\n' +
      'It became a hull; the next, a sail.',
  },
  novel_ping: {
    adapter: new NovelPingAdapter(),
    site: () =>
      new FakeSite()
        .addFixture(PING_NOVEL, 'novelfull/ping-novel.html')
        .addFixture(
          'https://novelping.com/ajax/chapter-archive?novelId=the-glass-ferry',
          'novelfull/ping-archive.html',
        )
        .addFixture(PING_CHAPTER, 'novelfull/ping-chapter.html')
        .add(PING_COVER, image),
    novel: PING_NOVEL,
    chapter: PING_CHAPTER,
    otherUrls: [PING_CHAPTER, `${PING_NOVEL}/`, 'http://www.novelping.com/book/the-glass-ferry'],
    meta: {
      title: 'The Glass Ferry',
      author: 'Tomas Reed',
      description: 'A ferry made of glass crosses a river of fog.',
      tags: ['Drama', 'Fantasy'],
      coverUrl: PING_COVER,
    },
    // Not the comment link, not another novel.
    chapters: ['Chapter 1', 'Chapter 2: Fog Tolls'],
    chapterTitle: 'Chapter 2: Fog Tolls',
    text:
      'The ferryman charged in fog, not coins.\n\n' +
      'Each passenger left a little of the view behind.',
  },
};

describe.each(Object.entries(CASES))('%s', (_source, c) => {
  it('leads novel and chapter addresses to the novel page', () => {
    expect(c.adapter.canonicalize(c.novel)).toBe(c.novel);
    for (const url of c.otherUrls) expect(c.adapter.canonicalize(url)).toBe(c.novel);
  });

  it('does not take the home page for a novel', () => {
    expect(() => c.adapter.canonicalize(c.adapter.homeUrl)).toThrow(UnsupportedUrl);
  });

  describe.skipIf(!hasFixtures)('pages', () => {
    it('reads the novel page', async () => {
      expect(await c.adapter.fetchNovel(c.site().session(), c.novel)).toEqual(c.meta);
    });

    it('reads the chapter list, with one request for the novel page', async () => {
      const site = c.site();
      const session = site.session();
      await c.adapter.fetchNovel(session, c.novel);
      const chapters = await c.adapter.fetchChapterList(session, c.chapter);
      expect(chapters.map((chapter) => chapter.title)).toEqual(c.chapters);
      expect(chapters.map((chapter) => chapter.url)).toContain(c.chapter);
      expect(site.requests.get(c.novel)).toBe(1);
    });

    it('reads the chapter text without ad slots', async () => {
      const chapter = await c.adapter.fetchChapter(c.site().session(), {
        url: c.chapter,
        title: 'x',
        publishedAt: null,
      });
      expect(chapter.title).toBe(c.chapterTitle);
      expect(htmlToText(chapter.html)).toBe(c.text);
    });

    it('reports an empty chapter list as a layout change', async () => {
      const site = c.site();
      for (const url of site.pages.keys()) {
        if (url.includes('ajax')) site.add(url, { body: '<ul></ul>' });
      }
      await expect(c.adapter.fetchChapterList(site.session(), c.novel)).rejects.toThrow(
        /no chapters/,
      );
    });
  });
});
