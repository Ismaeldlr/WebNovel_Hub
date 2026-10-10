import { describe, expect, it } from 'vitest';
import { FakeSite, JPEG, fixture, hasFixtures } from '../../../../test/sites.js';
import { htmlToText } from '../../../epub/normalize.js';
import { StructureChanged, UnsupportedUrl } from '../../errors.js';
import { RoyalRoadAdapter } from './index.js';

const adapter = new RoyalRoadAdapter();

const FICTION = 'https://www.royalroad.com/fiction/98765';
const CHAPTER = 'https://www.royalroad.com/fiction/98765/the-clockwork-ferry/chapter';
const COVER =
  'https://www.royalroadcdn.com/public/covers-full/98765-the-clockwork-ferry.jpg?time=1709300000';
const SECOND = `${CHAPTER}/1002/2-the-brass-pilot`;

function site(fiction = 'royal_road/fiction.html') {
  return new FakeSite()
    .addFixture(FICTION, fiction)
    .addFixture(SECOND, 'royal_road/chapter.html')
    .add(COVER, { body: JPEG, contentType: 'image/jpeg' });
}

const EXPECTED_CHAPTERS = [
  ['1. Departure', `${CHAPTER}/1001/1-departure`, '2024-03-01T18:00:00.000Z'],
  ['2. The Brass Pilot', SECOND, '2024-03-08T18:00:00.000Z'],
  [
    'Interlude – Harbour Lights',
    `${CHAPTER}/1003/interlude-harbour-lights`,
    '2024-03-15T18:00:00.000Z',
  ],
  ['3.5 Fog & Rust', `${CHAPTER}/1004/35-fog-rust`, '2024-03-22T18:00:00.000Z'],
];

const EXPECTED_TEXT = [
  'Chapter Two\nThe Brass Pilot',
  'The pilot was made of brass and patience, and it had not spoken in eleven years.',
  '“Wind me,” it said anyway.',
  'Mara set down the key.\nThen she picked it up again.',
  'The harbour bells began to ring — all of them, at once.',
].join('\n\n');

const listed = (chapters: { title: string; url: string; publishedAt: Date | null }[]) =>
  chapters.map((c) => [c.title, c.url, c.publishedAt?.toISOString()]);

function without(name: string, ...snippets: string[]): string {
  let html = fixture(name);
  for (const snippet of snippets) {
    expect(html).toContain(snippet);
    html = html.replace(snippet, '');
  }
  return html;
}

describe('Royal Road addresses', () => {
  it('matches the Royal Road hosts only', () => {
    expect(adapter.matches('https://www.royalroad.com/fiction/1')).toBe(true);
    expect(adapter.matches('https://royalroad.com/anything')).toBe(true);
    expect(adapter.matches('https://www.royalroadcdn.com/public/covers-full/1.jpg')).toBe(false);
  });

  it('identifies chapters by their id, whatever their slug', () => {
    expect(adapter.chapterKey(`${CHAPTER}/1002/2-the-brass-pilot`)).toBe('chapter/1002');
    expect(adapter.chapterKey(`${CHAPTER}/1002/renamed`)).toBe('chapter/1002');
  });

  it('explains which page to copy when the address is not a fiction', () => {
    expect(() => adapter.canonicalize('https://www.royalroad.com/fictions/best-rated')).toThrow(
      UnsupportedUrl,
    );
    try {
      adapter.canonicalize('https://www.royalroad.com/fictions/best-rated');
    } catch (error) {
      expect((error as UnsupportedUrl).userMessage()).toContain('fiction page');
    }
  });
});

describe.skipIf(!hasFixtures)('Royal Road pages', () => {
  it('reads the fiction page', async () => {
    const meta = await adapter.fetchNovel(site().session(), FICTION);
    expect(meta).toEqual({
      title: 'The Clockwork Ferry',
      author: 'wren_h',
      description:
        'A ferry that runs on clockwork, and the girl who winds it every dawn.\n\n' +
        'When the harbour’s bells fall silent, she has one crossing left to find out why.\n' +
        'Updates every Friday.',
      tags: ['Adventure', 'Steampunk', 'Slice of Life'],
      coverUrl: COVER,
    });
  });

  it('takes the placeholder cover for no cover', async () => {
    const meta = await adapter.fetchNovel(
      site('royal_road/fiction-no-cover.html').session(),
      FICTION,
    );
    expect(meta.coverUrl).toBeNull();
  });

  it('reads the chapter list from the embedded JSON, without drafts or patron chapters', async () => {
    const chapters = await adapter.fetchChapterList(site().session(), FICTION);
    expect(listed(chapters)).toEqual(EXPECTED_CHAPTERS);
  });

  it('falls back to the table of contents', async () => {
    const session = site('royal_road/fiction-table-only.html').session();
    expect(listed(await adapter.fetchChapterList(session, FICTION))).toEqual(EXPECTED_CHAPTERS);
  });

  it('asks once for the page that holds both metadata and chapter list', async () => {
    const fake = site();
    const session = fake.session();
    await adapter.fetchNovel(session, FICTION);
    await adapter.fetchChapterList(session, FICTION);
    expect(fake.requests.get(FICTION)).toBe(1);
  });

  it.each(['royal_road/chapter.html', 'royal_road/chapter-hidden-paragraph.html'])(
    'reads the chapter text without anti-piracy lines or author notes (%s)',
    async (name) => {
      const fake = site().addFixture(SECOND, name);
      const chapter = await adapter.fetchChapter(fake.session(), {
        url: SECOND,
        title: '2. The Brass Pilot',
        publishedAt: null,
      });
      expect(chapter.title).toBe('2. The Brass Pilot');
      const text = htmlToText(chapter.html);
      expect(text).toBe(EXPECTED_TEXT);
      for (const junk of [
        'sightings',
        'Unauthorized',
        'Thanks for reading',
        'Next week',
        'First!',
      ]) {
        expect(text).not.toContain(junk);
      }
    },
  );

  it('reports a missing title as a layout change', async () => {
    const html = without(
      'royal_road/fiction.html',
      '<h1 class="font-white">The Clockwork Ferry</h1>',
    );
    const fake = site().add(FICTION, { body: html });
    await expect(adapter.fetchNovel(fake.session(), FICTION)).rejects.toThrow(
      new StructureChanged(`no fiction title (.fic-title h1) at ${FICTION}`),
    );
  });

  it('reports a missing chapter list as a layout change', async () => {
    const fake = site().add(FICTION, {
      body: without('royal_road/fiction-table-only.html', 'id="chapters"'),
    });
    await expect(adapter.fetchChapterList(fake.session(), FICTION)).rejects.toThrow(/chapter list/);
  });

  it('reports a broken chapter script as a layout change', async () => {
    const html = fixture('royal_road/fiction.html').replace(
      'window.chapters = [',
      'window.chapters = [{oops',
    );
    const fake = site().add(FICTION, { body: html });
    await expect(adapter.fetchChapterList(fake.session(), FICTION)).rejects.toThrow(/JSON/);
  });

  it('reports a missing chapter body as a layout change', async () => {
    const fake = site().add(SECOND, {
      body: without('royal_road/chapter.html', 'chapter-inner chapter-content'),
    });
    await expect(
      adapter.fetchChapter(fake.session(), { url: SECOND, title: 'x', publishedAt: null }),
    ).rejects.toThrow(/chapter text/);
  });
});
