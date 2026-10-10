import { describe, expect, it } from 'vitest';
import { FakeSite, JPEG, hasFixtures } from '../../../../test/sites.js';
import { htmlToText } from '../../../epub/normalize.js';
import { UnsupportedUrl } from '../../errors.js';
import {
  HiraethTranslationAdapter,
  LightNovelHeavenAdapter,
  SleepyTranslationsAdapter,
  TranslatinOtakuAdapter,
  WuxiaWorldSiteAdapter,
} from './index.js';

const adapter = new SleepyTranslationsAdapter();

const NOVEL = 'https://sleepytranslations.com/series/the-moth-library/';
const CHAPTERS = `${NOVEL}ajax/chapters/`;
const COVER = 'https://sleepytranslations.com/wp-content/uploads/2021/03/moth-library-193x278.jpg';

const site = () =>
  new FakeSite()
    .addFixture(NOVEL, 'madara/novel.html')
    .addFixture(CHAPTERS, 'madara/chapters.html')
    .addFixture(`${NOVEL}chapter-2/`, 'madara/chapter.html')
    .add(COVER, { body: JPEG, contentType: 'image/jpeg' });

describe('Madara addresses', () => {
  it.each([
    NOVEL,
    NOVEL.slice(0, -1),
    `${NOVEL}chapter-2/`,
    `${NOVEL}chapter-2/?style=list`,
    'http://www.sleepytranslations.com/series/the-moth-library',
  ])('leads %s to the novel page', (url) => {
    expect(adapter.canonicalize(url)).toBe(NOVEL);
  });

  it.each([
    [
      new WuxiaWorldSiteAdapter(),
      'https://wuxiaworld.site/novel/a-b/chapter-1/',
      'https://wuxiaworld.site/novel/a-b/',
    ],
    [
      new LightNovelHeavenAdapter(),
      'https://lightnovelheaven.com/series/a-b',
      'https://lightnovelheaven.com/series/a-b/',
    ],
    [
      new HiraethTranslationAdapter(),
      'https://hiraethtranslation.com/novel/a-b/extra-1/',
      'https://hiraethtranslation.com/novel/a-b/',
    ],
    [
      new TranslatinOtakuAdapter(),
      'https://translatinotaku.net/novel/a-b/',
      'https://translatinotaku.net/novel/a-b/',
    ],
  ])('knows where %s keeps its novels', (siteAdapter, url, canonical) => {
    expect(siteAdapter.canonicalize(url)).toBe(canonical);
  });

  it.each([
    'https://sleepytranslations.com/',
    'https://sleepytranslations.com/novel/the-moth-library/', // this site uses /series/
    'https://sleepytranslations.com/genre/romance/',
  ])('does not take %s for a novel', (url) => {
    expect(() => adapter.canonicalize(url)).toThrow(UnsupportedUrl);
    try {
      adapter.canonicalize(url);
    } catch (error) {
      expect((error as UnsupportedUrl).userMessage()).toContain('/series/<name>/');
    }
  });
});

describe.skipIf(!hasFixtures)('Madara pages', () => {
  it('reads the novel page', async () => {
    expect(await adapter.fetchNovel(site().session(), NOVEL)).toEqual({
      title: 'The Moth Library', // without the HOT badge
      author: 'Yan Lu',
      description:
        'A librarian lends books only to moths.\n\n' +
        'Tonight one of them returns a book overdue by a century.',
      tags: ['Romance', 'Fantasy'],
      coverUrl: COVER, // the cover, not the site's logo in og:image
    });
  });

  it('leaves out chapters sold for coins', async () => {
    const fake = site();
    const chapters = await adapter.fetchChapterList(fake.session(), `${NOVEL}chapter-2/`);
    expect(chapters.map((chapter) => chapter.title)).toEqual([
      'Chapter 1',
      'Chapter 2',
      'Chapter 3',
    ]);
    expect(chapters[0]!.url).toBe(`${NOVEL}chapter-1/`);
    expect(chapters[0]!.publishedAt?.toISOString()).toBe('2021-03-01T00:00:00.000Z');
    expect(fake.requests.get(CHAPTERS)).toBe(1);
    expect(fake.log.find((request) => request.url === CHAPTERS)?.method).toBe('POST');
  });

  it('reads the chapter text without ads and notices', async () => {
    const chapter = await adapter.fetchChapter(site().session(), {
      url: `${NOVEL}chapter-2/`,
      title: 'x',
      publishedAt: null,
    });
    expect(chapter.title).toBe('The Moth Library - Chapter 2');
    expect(htmlToText(chapter.html)).toBe(
      'Chapter 2: Overdue\n\nThe moth set the book on the counter.\n\n' +
        '“A hundred years,” said the librarian, “is a long fine.”',
    );
  });

  it('reports an empty chapter list as a layout change', async () => {
    const fake = site().add(CHAPTERS, { body: '<div class="page-content-listing"></div>' });
    await expect(adapter.fetchChapterList(fake.session(), NOVEL)).rejects.toThrow(/no chapters/);
  });
});
