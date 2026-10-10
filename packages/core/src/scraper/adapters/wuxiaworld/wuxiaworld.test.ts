import { describe, expect, it } from 'vitest';
import { FakeSite, JPEG, fixture, hasFixtures } from '../../../../test/sites.js';
import { htmlToText } from '../../../epub/normalize.js';
import { PermanentError, StructureChanged, UnsupportedUrl } from '../../errors.js';
import { WuxiaworldAdapter } from './index.js';
import * as pb from './protobuf.js';

const adapter = new WuxiaworldAdapter();

const NOVEL = 'https://www.wuxiaworld.com/novel/the-ninth-kiln';
const CHAPTERS = 'https://api2.wuxiaworld.com/wuxiaworld.api.v2.Chapters/GetChapterList';
const COVER = 'https://cdn.wuxiaworld.com/images/covers/nk.webp?v=abc';

/** One protobuf field: a varint for numbers, length-delimited otherwise. */
function field(number: number, value: number | string | Uint8Array): Uint8Array {
  if (typeof value === 'number') return pb.intField(number, value);
  const data = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return pb.concat(pb.encodeVarint(number * 8 + 2), pb.encodeVarint(data.length), data);
}

function chapter(entity: number, name: string, slug: string, { free = true, visible = true } = {}) {
  return pb.concat(
    field(1, entity),
    field(2, name),
    field(3, slug),
    field(7, visible ? 1 : 0),
    field(18, field(1, 1767139200 + entity)),
    field(20, free ? field(1, 1) : new Uint8Array()),
  );
}

/** GetChapterList's answer: two volumes, listed out of order, and the call's trailer. */
function chapterList(): Uint8Array {
  const volume2 = pb.concat(
    field(1, 12),
    field(2, 'The Fire'),
    field(3, 2),
    field(6, chapter(9003, 'Chapter 3 - Kiln Fire', 'nk-chapter-3', { free: false })),
    field(6, chapter(9004, 'Chapter 4 - Ash', 'nk-chapter-4')),
  );
  const volume1 = pb.concat(
    field(1, 11),
    field(2, 'The Clay'),
    field(3, 1),
    field(6, chapter(9001, 'Chapter 1 - River  Clay', 'nk-chapter-1')),
    field(6, chapter(9002, 'Chapter 2 - Slip and Glaze', 'nk-chapter-2')),
    field(6, chapter(9009, 'Draft', 'nk-draft', { visible: false })),
  );
  const trailer = new TextEncoder().encode('grpc-status: 0\r\ngrpc-message: \r\n');
  const header = new Uint8Array(5);
  header[0] = 0x80;
  new DataView(header.buffer).setUint32(1, trailer.length);
  return pb.concat(
    pb.grpcWebFrame(pb.concat(field(1, volume2), field(1, volume1))),
    header,
    trailer,
  );
}

const site = () => {
  const fake = new FakeSite()
    .add(CHAPTERS, { body: chapterList(), contentType: 'application/grpc-web' })
    .add(COVER, { body: JPEG, contentType: 'image/jpeg' });
  if (!hasFixtures) return fake;
  return fake
    .addFixture(NOVEL, 'wuxiaworld/novel.html')
    .addFixture(`${NOVEL}/nk-chapter-2`, 'wuxiaworld/chapter.html');
};

describe('Wuxiaworld', () => {
  it.each([
    NOVEL,
    `${NOVEL}/nk-chapter-2`,
    'https://wuxiaworld.com/novel/the-ninth-kiln/',
    'https://m.wuxiaworld.com/novel/the-ninth-kiln?tab=chapters',
  ])('leads %s to the novel page', (url) => {
    expect(adapter.canonicalize(url)).toBe(NOVEL);
  });

  it.each(['https://www.wuxiaworld.com/', 'https://www.wuxiaworld.com/novels'])(
    'does not take %s for a novel',
    (url) => {
      expect(() => adapter.canonicalize(url)).toThrow(UnsupportedUrl);
    },
  );

  it('reads back the protobuf it writes', () => {
    const message = pb.concat(pb.intField(1, 300), pb.intField(7, 1));
    const fields = pb.decode(pb.grpcWebMessage(pb.grpcWebFrame(message)));
    expect(pb.firstInt(fields, 1)).toBe(300);
    expect(pb.firstInt(fields, 7)).toBe(1);
    expect(pb.firstInt(fields, 9, 5)).toBe(5);
  });

  it('reports a failed call', () => {
    const trailer = new TextEncoder().encode('grpc-status: 5\r\n');
    const body = pb.concat(Uint8Array.of(0x80, 0, 0, 0, trailer.length), trailer);
    expect(() => pb.grpcWebMessage(body)).toThrow(StructureChanged);
  });

  it('lists the free, visible chapters in volume order', async () => {
    const fake = site();
    // The chapter list needs only the novel's id from its page; a fixture-free page will do.
    if (!hasFixtures) {
      fake.add(NOVEL, {
        body: `<script>window.__REACT_QUERY_STATE__ = ${JSON.stringify({
          queries: [
            { queryKey: ['novel', 'the-ninth-kiln'], state: { data: { item: { id: 77 } } } },
          ],
        })};</script>`,
      });
    }
    const chapters = await adapter.fetchChapterList(fake.session(), `${NOVEL}/nk-chapter-2`);
    expect(chapters.map((c) => c.title)).toEqual([
      'Chapter 1 - River Clay',
      'Chapter 2 - Slip and Glaze',
      'Chapter 4 - Ash', // chapter 3 is sold, the draft is hidden
    ]);
    expect(chapters[1]!.url).toBe(`${NOVEL}/nk-chapter-2`);
    expect(chapters[0]!.publishedAt).toEqual(new Date((1767139200 + 9001) * 1000));
    expect(fake.requests.get(NOVEL)).toBe(1);
    expect(fake.requests.get(CHAPTERS)).toBe(1);
  });

  describe.skipIf(!hasFixtures)('pages', () => {
    it('reads the novel page', async () => {
      expect(await adapter.fetchNovel(site().session(), NOVEL)).toEqual({
        title: 'The Ninth Kiln',
        author: 'Qing Hu (青湖)',
        description: 'Eight kilns forged the world.\n\nShen Yao must fire the ninth.',
        tags: ['Xianxia', 'Crafting'],
        coverUrl: COVER,
      });
    });

    it('reads the chapter text', async () => {
      const page = await adapter.fetchChapter(site().session(), {
        url: `${NOVEL}/nk-chapter-2`,
        title: 'x',
        publishedAt: null,
      });
      expect(page.title).toBe('Chapter 2 - Slip and Glaze');
      expect(htmlToText(page.html)).toBe(
        'Chapter 2 – Slip and Glaze\n\nShen Yao mixed the slip with river clay.\n\n' +
          'The glaze cracked & sang as it cooled.',
      );
    });

    it('reports a teaser as a locked chapter', async () => {
      const url = `${NOVEL}/nk-chapter-2`;
      const fake = site().add(url, {
        body: fixture('wuxiaworld/chapter.html').replace('"isTeaser":false', '"isTeaser":true'),
      });
      const failure = adapter.fetchChapter(fake.session(), { url, title: 'x', publishedAt: null });
      await expect(failure).rejects.toThrow(PermanentError);
      await expect(failure).rejects.toThrow(/locked/);
    });

    it('reports a page without its data as a layout change', async () => {
      const fake = site().add(NOVEL, { body: "<html><body><div id='app'></div></body></html>" });
      await expect(adapter.fetchNovel(fake.session(), NOVEL)).rejects.toThrow(
        /__REACT_QUERY_STATE__/,
      );
    });
  });
});
