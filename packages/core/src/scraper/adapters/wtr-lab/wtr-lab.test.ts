import { describe, expect, it } from 'vitest';
import { FakeSite, PNG, fixture, hasFixtures, jsonResponse } from '../../../../test/sites.js';
import { htmlToText } from '../../../epub/normalize.js';
import {
  PermanentError,
  RateLimited,
  SignInRequired,
  StructureChanged,
  UnsupportedUrl,
} from '../../errors.js';
import { HostThrottle, SourceSession } from '../../session.js';
import { WtrLabAdapter } from './index.js';

const adapter = new WtrLabAdapter();

const NOVEL = 'https://wtr-lab.com/en/novel/777/the-paper-crane-inn';
const CHAPTERS = 'https://wtr-lab.com/api/chapters/777';
const COVER = 'https://img.wtr-lab.com/cdn/series/paper-crane-inn';

function site() {
  const fake = new FakeSite()
    .addFixture(NOVEL, 'wtr_lab/novel.html')
    .addFixture(CHAPTERS, 'wtr_lab/chapters.json', 'application/json')
    .add(COVER, { body: PNG, contentType: 'image/png' });
  fake.rendered.set(`${NOVEL}/chapter-2`, fixture('wtr_lab/chapter-rendered.html'));
  return fake;
}

describe('WTR Lab addresses', () => {
  it.each([
    NOVEL,
    `${NOVEL}/chapter-2`,
    `${NOVEL}?tab=toc`,
    'https://wtr-lab.com/es/novel/777/the-paper-crane-inn',
    'https://wtr-lab.com/en/serie-777/the-paper-crane-inn',
    'https://www.wtr-lab.com/en/novel/777/The-Paper-Crane-Inn/',
  ])('leads %s to the novel page', (url) => {
    expect(adapter.canonicalize(url)).toBe(NOVEL);
  });

  it.each([
    'https://wtr-lab.com/en/novel/777',
    'https://wtr-lab.com/en/ranking',
    'https://wtr-lab.com/',
  ])('does not take %s for a novel', (url) => {
    expect(() => adapter.canonicalize(url)).toThrow(UnsupportedUrl);
  });
});

describe.skipIf(!hasFixtures)('WTR Lab pages', () => {
  it('reads the novel from the page data', async () => {
    expect(await adapter.fetchNovel(site().session(), NOVEL)).toEqual({
      title: 'The Paper Crane Inn',
      author: 'Wen Yao',
      description:
        'An inn that only opens for travellers made of paper.\n\nTonight, a real one knocks.\nChapters daily.',
      tags: [],
      coverUrl: COVER,
    });
  });

  it("reads the chapter list from the site's JSON endpoint", async () => {
    const fake = site();
    const session = fake.session();
    await adapter.fetchNovel(session, NOVEL);
    const chapters = await adapter.fetchChapterList(session, NOVEL);
    expect(chapters.map((c) => [c.url, c.title])).toEqual([
      [`${NOVEL}/chapter-1`, 'The First Guest'],
      [`${NOVEL}/chapter-2`, 'Folded Rooms'],
      [`${NOVEL}/chapter-3`, 'Chapter 3'], // untitled on the site
    ]);
    expect(chapters[0]!.publishedAt?.toISOString()).toBe('2025-05-01T10:00:00.000Z');
    expect(fake.requests.get(NOVEL)).toBe(1);
  });

  it('completes a short chapter list in ranges', async () => {
    const body = JSON.parse(fixture('wtr_lab/chapters.json')) as { chapters: unknown[] };
    const fake = site()
      .add(CHAPTERS, jsonResponse({ chapters: body.chapters.slice(0, 2) }))
      .add(`${CHAPTERS}?start=3&end=502`, jsonResponse({ chapters: body.chapters.slice(2) }));
    const chapters = await adapter.fetchChapterList(fake.session(), NOVEL);
    expect(chapters.map((c) => c.url.split('-').pop())).toEqual(['1', '2', '3']);
  });

  it('reads the chapter text from the rendered page', async () => {
    const fake = site();
    const url = `${NOVEL}/chapter-2`;
    const page = await adapter.fetchChapter(fake.session(), {
      url,
      title: 'Folded Rooms',
      publishedAt: null,
    });
    expect(htmlToText(page.html)).toBe(
      'Chapter 2: Folded Rooms\n\n' +
        'Every room at the Paper Crane Inn folded away at dawn.\n\n' +
        'The keeper, Wen Yao, counted them twice.\n\n' +
        '“One too many,” she said.',
    );
    expect(fake.renders.get(url)).toBe(1);
    expect(fake.requests.get(url)).toBeUndefined(); // rendered, not fetched over plain HTTP
  });

  it('says so when this device cannot render pages', async () => {
    const fake = site();
    const session = new SourceSession({ http: fake, throttle: new HostThrottle(0) });
    await expect(
      adapter.fetchChapter(session, { url: `${NOVEL}/chapter-2`, title: 'x', publishedAt: null }),
    ).rejects.toThrow(PermanentError);
  });

  it('reports changed page data as a layout change', async () => {
    const fake = site().add(NOVEL, { body: '<html><body>No page data</body></html>' });
    await expect(adapter.fetchNovel(fake.session(), NOVEL)).rejects.toThrow(/page data/);
  });

  it('reports an endpoint that stops answering JSON as a layout change', async () => {
    const fake = site().add(CHAPTERS, { body: '<html>Maintenance</html>' });
    await expect(adapter.fetchChapterList(fake.session(), NOVEL)).rejects.toThrow(
      /did not return JSON/,
    );
  });

  it('reports a page whose text never loads as a layout change', async () => {
    const fake = site();
    const url = `${NOVEL}/chapter-2`;
    fake.rendered.set(url, '<div class="chapter-body"></div>');
    await expect(
      adapter.fetchChapter(fake.session(), { url, title: 'x', publishedAt: null }),
    ).rejects.toThrow(StructureChanged);
  });

  it('backs off when the site asks for a security check instead of the text', async () => {
    const fake = site();
    const url = `${NOVEL}/chapter-2`;
    fake.rendered.set(
      url,
      '<div class="chapter-body"><div class="turnstile-challenge">Security Check Required' +
        '<input type="hidden" name="cf-turnstile-response"></div></div>',
    );
    await expect(
      adapter.fetchChapter(fake.session(), { url, title: 'x', publishedAt: null }),
    ).rejects.toThrow(RateLimited);
  });

  describe('past the chapters guests may read', () => {
    const url = `${NOVEL}/chapter-15`;
    const ref = { url, title: 'x', publishedAt: null };
    // What a guest sees instead of the text: the notice and a link to Google's translation.
    const LOCKED =
      '<div class="chapter-body"><div><b>AI Translation Requires Registration</b></div>' +
      `<div><a href="/en/novel/777/the-paper-crane-inn/chapter-15?service=web">Read</a></div></div>`;
    const MACHINE =
      '<div class="chapter-body"><div class="wtr-line">The inn was quiet.</div></div>';

    const lockedSite = () => {
      const fake = site();
      fake.rendered.set(url, LOCKED);
      fake.rendered.set(`${url}?service=web`, MACHINE);
      return fake;
    };
    const session = (fake: FakeSite, wtrLabMachineTranslation: boolean) =>
      new SourceSession({ http: fake, throttle: new HostThrottle(0), renderer: fake }, undefined, {
        wtrLabMachineTranslation,
      });

    it('asks the reader to sign in', async () => {
      const fake = lockedSite();
      await expect(adapter.fetchChapter(session(fake, false), ref)).rejects.toThrow(SignInRequired);
      expect(fake.renders.get(`${url}?service=web`)).toBeUndefined();
    });

    it('fetches the machine translation when the reader chose it', async () => {
      const page = await adapter.fetchChapter(session(lockedSite(), true), ref);
      expect(htmlToText(page.html)).toBe('The inn was quiet.');
    });
  });

  it('tells signed-in readers from guests', () => {
    expect(adapter.account.signedIn('<pre>{"error":"Unauthorized"}</pre>')).toBe(false);
    expect(adapter.account.signedIn('<pre>{"config":{"terms":[]}}</pre>')).toBe(true);
    expect(adapter.account.signedIn('<html>Just a moment...</html>')).toBeNull();
  });
});
