import { describe, expect, it } from 'vitest';
import { FakeSite, JPEG, fixture, hasFixtures, jsonResponse } from '../../../../test/sites.js';
import { htmlToText } from '../../../epub/normalize.js';
import { UnsupportedUrl } from '../../errors.js';
import { LnmtlAdapter } from './index.js';

const adapter = new LnmtlAdapter();

const NOVEL = 'https://lnmtl.com/novel/the-jade-abacus';
const chapter = (n: number) => `https://lnmtl.com/chapter/the-jade-abacus-chapter-${n}`;
const volume = (page: number, id: number) =>
  `https://lnmtl.com/chapter?page=${page}&volumeId=${id}`;
const COVER = 'https://lnmtl.com/assets/images/novel/77-200.jpg';

const entry = (number: number, position: number, title: string) => ({
  position,
  title,
  slug: `the-jade-abacus-chapter-${number}`,
  created_at: `2025-01-0${number} 10:00:00`,
});

const site = () =>
  new FakeSite()
    .addFixture(NOVEL, 'lnmtl/novel.html')
    .add(
      volume(1, 501),
      jsonResponse({
        last_page: 2,
        data: [entry(2, 2, 'Chapter 2 Bead of Jade'), entry(1, 1, 'Chapter 1 Debt')],
      }),
    )
    .add(volume(2, 501), jsonResponse({ last_page: 2, data: [entry(3, 3, 'Chapter 3 Interest')] }))
    .add(
      volume(1, 502),
      jsonResponse({ last_page: 1, data: [entry(4, 1, 'Chapter 4 Second Ledger')] }),
    )
    .addFixture(chapter(2), 'lnmtl/chapter.html')
    .add(COVER, { body: JPEG, contentType: 'image/jpeg' });

describe('LNMTL addresses', () => {
  it.each([NOVEL, `${NOVEL}/`, 'http://www.lnmtl.com/novel/the-jade-abacus?page=2'])(
    'leads %s to the novel page',
    (url) => {
      expect(adapter.canonicalize(url)).toBe(NOVEL);
    },
  );

  it('refuses chapter addresses, saying why', () => {
    try {
      adapter.canonicalize(chapter(2));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedUrl);
      expect((error as UnsupportedUrl).userMessage()).toContain('chapter addresses');
    }
  });
});

describe.skipIf(!hasFixtures)('LNMTL pages', () => {
  it('reads the novel page', async () => {
    expect(await adapter.fetchNovel(site().session(), NOVEL)).toEqual({
      title: 'The Jade Abacus', // without the original name
      author: 'Bai Zhu',
      description: "An accountant's abacus counts more than coins.\n\nIt counts lifespans.",
      tags: [],
      coverUrl: COVER,
    });
  });

  it('reads every volume and page, in order', async () => {
    const fake = site();
    const session = fake.session();
    await adapter.fetchNovel(session, NOVEL);
    const chapters = await adapter.fetchChapterList(session, NOVEL);
    expect(chapters.map((c) => c.title)).toEqual([
      'Chapter 1 Debt',
      'Chapter 2 Bead of Jade',
      'Chapter 3 Interest',
      'Chapter 4 Second Ledger',
    ]);
    expect(chapters[1]!.url).toBe(chapter(2));
    expect(chapters[0]!.publishedAt?.toISOString()).toBe('2025-01-01T10:00:00.000Z');
    expect(fake.requests.get(NOVEL)).toBe(1);
    expect(fake.requests.get(volume(2, 501))).toBe(1);
  });

  it('keeps the translation of a chapter', async () => {
    const page = await adapter.fetchChapter(site().session(), {
      url: chapter(2),
      title: 'x',
      publishedAt: null,
    });
    expect(page.title).toBe('#2: Chapter 2 Bead of Jade');
    expect(htmlToText(page.html)).toBe(
      'He moves first bead.\n\n„One year.”\n\nThe lamp flickers & dims.',
    );
  });

  it('reports a page without volumes as a layout change', async () => {
    const fake = site().add(NOVEL, {
      body: fixture('lnmtl/novel.html').replace('lnmtl.volumes', 'lnmtl.books'),
    });
    await expect(adapter.fetchChapterList(fake.session(), NOVEL)).rejects.toThrow(/no volumes/);
  });
});
