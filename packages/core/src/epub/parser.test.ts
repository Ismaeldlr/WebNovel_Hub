import { describe, expect, it } from 'vitest';
import { CONTAINER, png, sampleEpub, xhtml, zip } from '../../test/epub.js';
import { EPUB_MESSAGES, EpubError, parseEpub, resolveHref } from './parser.js';
import { ZIP_LIMITS, openZip } from './zip.js';

const parse = (buffer: Buffer) => parseEpub(buffer, { fallbackTitle: 'my-upload' });

async function refusal(buffer: Buffer): Promise<string> {
  const error: unknown = await parse(buffer).catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(EpubError);
  return (error as EpubError).message;
}

const base = [
  { name: 'mimetype', content: 'application/epub+zip' },
  { name: 'META-INF/container.xml', content: CONTAINER() },
];

describe('parseEpub: EPUB 3 (nav document)', () => {
  it('reads metadata, the cover and chapters in spine order with the nav titles', async () => {
    const book = await parse(sampleEpub());
    expect(book).toMatchObject({
      title: 'The Lantern Courier',
      author: 'Ada Quill',
      description: 'A courier carries light between towns.\n\nRain follows.',
      tags: ['Fantasy', 'Adventure'],
      cover: { extension: 'png' },
    });
    expect(Buffer.from(book.cover?.bytes.subarray(1, 4) ?? []).toString('latin1')).toBe('PNG');
    // The cover page has no text and the nav document is navigation: neither is a chapter.
    expect(book.chapters).toEqual([
      {
        title: 'Chapter 1',
        // The <h1> repeating the title is dropped: the reader shows the title already.
        text: 'The lantern in room 1 flickered as the courier arrived.\n\nShe set the parcel down and listened to the rain.',
        wordCount: 20,
      },
      expect.objectContaining({ title: 'Chapter 2' }),
      expect.objectContaining({ title: 'Chapter 3' }),
    ]);
  });

  it('prefers the main title and the authors among several creators', async () => {
    const opf = `<?xml version="1.0"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title id="sub">A Subtitle</dc:title>
    <meta refines="#sub" property="title-type">subtitle</meta>
    <dc:title id="main">Main &amp; Only</dc:title>
    <meta refines="#main" property="title-type">main</meta>
    <dc:creator id="ill">Ina Illustrator</dc:creator>
    <meta refines="#ill" property="role">ill</meta>
    <dc:creator id="a1">First Author</dc:creator>
    <dc:creator id="a2">Second Author</dc:creator>
    <meta refines="#a2" property="role">aut</meta>
    <dc:description>  Plain words
      over two lines.

      A second paragraph.  </dc:description>
  </metadata>
  <manifest><item id="c" href="c.xhtml" media-type="application/xhtml+xml"/></manifest>
  <spine><itemref idref="c"/></spine>
</package>`;
    const book = await parse(
      zip([
        ...base,
        { name: 'OEBPS/content.opf', content: opf },
        { name: 'OEBPS/c.xhtml', content: xhtml('x', '<p>Only text.</p>') },
      ]),
    );
    expect(book).toMatchObject({
      title: 'Main & Only',
      author: 'First Author, Second Author',
      description: 'Plain words over two lines.\n\nA second paragraph.',
      tags: [],
      cover: null,
    });
    // No table of contents and no heading: numbered.
    expect(book.chapters).toEqual([{ title: 'Chapter 1', text: 'Only text.', wordCount: 2 }]);
  });
});

describe('parseEpub: EPUB 2 (NCX)', () => {
  it('reads an NCX with nested points, meta cover, opf:role and encoded, nested paths', async () => {
    const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>Harbour Songs</dc:title>
    <dc:creator opf:role="aut" opf:file-as="Wren, Milo">Milo Wren</dc:creator>
    <dc:creator opf:role="edt">Some Editor</dc:creator>
    <dc:subject>Sea</dc:subject><dc:subject>sea</dc:subject><dc:subject>Poetry</dc:subject>
    <dc:description>&lt;div&gt;&lt;p&gt;Escaped &amp;amp; formatted.&lt;/p&gt;&lt;/div&gt;</dc:description>
    <meta name="cover" content="cover-image"/>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="cover-image" href="images/Cover%20Art.jpg" media-type="image/jpeg"/>
    <item id="part" href="text/part%201.html" media-type="application/xhtml+xml"/>
    <item id="c1" href="text/ch%201.html" media-type="application/xhtml+xml"/>
    <item id="c2" href="text/ch2.html" media-type="application/xhtml+xml"/>
    <item id="notes" href="text/notes.html" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="part"/><itemref idref="c1"/><itemref idref="c2"/>
    <itemref idref="notes" linear="no"/>
  </spine>
  <guide><reference type="cover" title="Cover" href="text/missing-cover.html"/></guide>
</package>`;
    const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="p1" playOrder="1"><navLabel><text>Part One</text></navLabel><content src="text/part%201.html"/>
      <navPoint id="p2" playOrder="2"><navLabel><text>  I. The   Quay </text></navLabel><content src="text/ch%201.html"/></navPoint>
      <navPoint id="p3" playOrder="3"><navLabel><text>II. Nets</text></navLabel><content src="text/ch2.html#start"/></navPoint>
    </navPoint>
  </navMap>
</ncx>`;
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
    const book = await parse(
      zip([
        ...base,
        { name: 'OEBPS/content.opf', content: opf },
        { name: 'OEBPS/toc.ncx', content: ncx },
        { name: 'OEBPS/images/Cover Art.jpg', content: jpeg, store: true },
        { name: 'OEBPS/text/part 1.html', content: xhtml('x', '<h1 class="part">Part One</h1>') },
        {
          name: 'OEBPS/text/ch 1.html',
          // Windows-1252, as declared: "café" and curly quotes.
          content: Buffer.concat([
            Buffer.from(
              '<?xml version="1.0" encoding="windows-1252"?><html><body><p>A caf',
              'latin1',
            ),
            Buffer.from([0xe9, 0x20, 0x93, 0x6f, 0x6b, 0x94]),
            Buffer.from('</p></body></html>', 'latin1'),
          ]),
        },
        {
          name: 'OEBPS/text/ch2.html',
          content: xhtml('x', '<h2 id="start">II. Nets</h2><p>Mending.</p>'),
        },
        { name: 'OEBPS/text/notes.html', content: xhtml('x', '<p>Endnotes are not linear.</p>') },
      ]),
    );
    expect(book).toMatchObject({
      title: 'Harbour Songs',
      author: 'Milo Wren',
      description: 'Escaped & formatted.',
      tags: ['Sea', 'Poetry'],
      cover: { extension: 'jpg' },
    });
    expect(book.chapters).toEqual([
      // Only the title: kept, so the part page isn't empty.
      { title: 'Part One', text: 'Part One', wordCount: 2 },
      { title: 'I. The Quay', text: 'A café “ok”', wordCount: 3 },
      { title: 'II. Nets', text: 'Mending.', wordCount: 1 },
    ]);
  });
});

describe('parseEpub: odd tables of contents', () => {
  const opf = (items: string[]) => `<?xml version="1.0"?>
<package version="2.0" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"/>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    ${items.map((name) => `<item id="${name}" href="${name}.xhtml" media-type="application/xhtml+xml"/>`).join('')}
  </manifest>
  <spine toc="ncx">${items.map((name) => `<itemref idref="${name}"/>`).join('')}</spine>
</package>`;
  const ncx = (points: [string, string][]) =>
    `<ncx><navMap>${points
      .map(
        ([label, src]) =>
          `<navPoint><navLabel><text>${label}</text></navLabel><content src="${src}"/></navPoint>`,
      )
      .join('')}</navMap></ncx>`;

  it('splits files at anchors, joins split files, and starts chapters at unlisted headings', async () => {
    const book = await parse(
      zip([
        ...base,
        { name: 'OEBPS/content.opf', content: opf(['title', 'book-1', 'book-2', 'extra']) },
        {
          name: 'OEBPS/toc.ncx',
          content: ncx([
            ['CHAPTER I', 'book-1.xhtml#chap01'],
            ['CHAPTER II', 'book-1.xhtml#chap02'],
            ['Gone', 'missing.xhtml'],
            ['Elsewhere', 'https://example.org/'],
          ]),
        },
        // Front matter that the contents don't list: its own chapter, titled by its heading.
        { name: 'OEBPS/title.xhtml', content: xhtml('x', '<h1>The Mill</h1><p>A story.</p>') },
        {
          // Project Gutenberg style: several chapters in one file, marked by anchors.
          name: 'OEBPS/book-1.xhtml',
          content: xhtml(
            'x',
            `<div class="chapter"><h2><a id="chap01"/>CHAPTER I</h2><p>The wheel turned.</p></div>
             <div class="chapter"><h2><a id="chap02"/>CHAPTER II</h2><p>The river rose.</p></div>`,
          ),
        },
        // Calibre style: the chapter continues in the next file, which the contents skip.
        { name: 'OEBPS/book-2.xhtml', content: xhtml('x', '<p>And kept rising.</p>') },
        // Not listed, but it starts with a heading: a chapter of its own.
        { name: 'OEBPS/extra.xhtml', content: xhtml('x', '<h3>Afterword</h3><p>Thanks.</p>') },
      ]),
    );
    expect(book.title).toBe('my-upload'); // no dc:title: the file's name
    expect(book.chapters.map(({ title, text }) => ({ title, text }))).toEqual([
      { title: 'The Mill', text: 'A story.' },
      { title: 'CHAPTER I', text: 'The wheel turned.' },
      { title: 'CHAPTER II', text: 'The river rose.\n\nAnd kept rising.' },
      { title: 'Afterword', text: 'Thanks.' },
    ]);
  });

  it('makes each document a chapter when there is no usable table of contents', async () => {
    const book = await parse(
      zip([
        ...base,
        { name: 'OEBPS/content.opf', content: opf(['a', 'b', 'c']) },
        { name: 'OEBPS/toc.ncx', content: ncx([['Nowhere', 'missing.xhtml']]) },
        { name: 'OEBPS/a.xhtml', content: xhtml('x', '<p>First, no heading.</p>') },
        { name: 'OEBPS/b.xhtml', content: xhtml('x', '<p><img src="art.png"/></p>') },
        { name: 'OEBPS/c.xhtml', content: xhtml('x', '<h2>Last</h2><p>Words.</p>') },
      ]),
    );
    expect(book.chapters).toEqual([
      { title: 'Chapter 1', text: 'First, no heading.', wordCount: 3 },
      { title: 'Last', text: 'Words.', wordCount: 1 },
    ]);
  });
});

describe('parseEpub: covers', () => {
  const opf = (manifest: string, guide = '') => `<?xml version="1.0"?>
<package version="2.0" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>T</dc:title></metadata>
  <manifest><item id="c" href="c.xhtml" media-type="application/xhtml+xml"/>${manifest}</manifest>
  <spine><itemref idref="c"/></spine>${guide}
</package>`;
  const files = (
    manifest: string,
    extra: { name: string; content: string | Buffer }[],
    guide = '',
  ) =>
    zip([
      ...base,
      { name: 'OEBPS/content.opf', content: opf(manifest, guide) },
      { name: 'OEBPS/c.xhtml', content: xhtml('x', '<p>Text.</p>') },
      ...extra,
    ]);

  it("finds the image on the guide's cover page", async () => {
    const book = await parse(
      files(
        '<item id="img" href="i/front.png" media-type="image/png"/>',
        [
          { name: 'OEBPS/i/front.png', content: png() },
          {
            name: 'OEBPS/p/cover.xhtml',
            content: xhtml(
              'x',
              '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="../i/front.png"/></svg>',
            ),
          },
        ],
        '<guide><reference type="cover" href="p/cover.xhtml"/></guide>',
      ),
    );
    expect(book.cover?.extension).toBe('png');
  });

  it('ignores a cover that is not an image we store, or larger than 8 MB', async () => {
    const svg = await parse(
      files(
        '<item id="cover" href="cover.svg" media-type="image/svg+xml" properties="cover-image"/>',
        [{ name: 'OEBPS/cover.svg', content: '<svg xmlns="http://www.w3.org/2000/svg"/>' }],
      ),
    );
    expect(svg.cover).toBeNull();
    const huge = Buffer.concat([png(), Buffer.alloc(8 * 1024 * 1024)]);
    const big = await parse(
      files('<item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/>', [
        { name: 'OEBPS/cover.png', content: huge },
      ]),
    );
    expect(big.cover).toBeNull();
  });
});

describe('parseEpub: refusals', () => {
  it('refuses files that are not EPUBs', async () => {
    expect(await refusal(Buffer.from('PK\x03\x04 but not really a zip'))).toBe(
      "This file isn't a valid EPUB: it can't be opened as a ZIP archive.",
    );
    expect(await refusal(zip([{ name: 'readme.txt', content: 'hello' }]))).toBe(
      EPUB_MESSAGES.noContainer,
    );
    expect(
      await refusal(zip([{ name: 'mimetype', content: 'application/zip' }, ...base.slice(1)])),
    ).toBe(EPUB_MESSAGES.notEpub);
    expect(await refusal(zip(base))).toBe(EPUB_MESSAGES.noPackage);
  });

  it('refuses an EPUB without any text', async () => {
    const opf = `<package xmlns="http://www.idpf.org/2007/opf"><metadata/>
      <manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/></manifest>
      <spine><itemref idref="a"/></spine></package>`;
    const buffer = zip([
      ...base,
      { name: 'OEBPS/content.opf', content: opf },
      { name: 'OEBPS/a.xhtml', content: xhtml('x', '<img src="page1.jpg"/>') },
    ]);
    expect(await refusal(buffer)).toBe(EPUB_MESSAGES.noChapters);
  });

  it('refuses zip bombs by entry count and declared size', async () => {
    const many = zip(
      Array.from({ length: ZIP_LIMITS.maxEntries + 1 }, (_, index) => ({
        name: `f${index}`,
        content: '',
        store: true,
      })),
    );
    expect(await refusal(many)).toBe('This EPUB holds more files than we can import.');
    const declared = zip([
      ...base,
      { name: 'OEBPS/big.xhtml', content: 'x', declaredSize: ZIP_LIMITS.maxEntryBytes + 1 },
    ]);
    expect(await refusal(declared)).toBe('This EPUB unpacks to more than we can import.');
  });

  it('never inflates past the declared size, and refuses names that climb out', async () => {
    // Declares 10 bytes but inflates to a megabyte: the read stops and the file is unusable.
    const liar = zip([{ name: 'a.txt', content: Buffer.alloc(1024 * 1024), declaredSize: 10 }]);
    expect(await openZip(liar).read('a.txt')).toBeNull();

    const traversal = zip([...base, { name: '../../etc/passwd', content: 'x' }]);
    expect(await refusal(traversal)).toBe(
      "This file isn't a valid EPUB: it can't be opened as a ZIP archive.",
    );
  });
});

describe('resolveHref', () => {
  it('resolves relative, encoded and fragment hrefs inside the archive only', () => {
    expect(resolveHref('OEBPS/Text/a.xhtml', '../Images/My%20Pic.png')).toEqual({
      path: 'OEBPS/Images/My Pic.png',
      fragment: null,
    });
    expect(resolveHref('OEBPS/a.xhtml', 'b.xhtml#part%202')).toEqual({
      path: 'OEBPS/b.xhtml',
      fragment: 'part 2',
    });
    expect(resolveHref('OEBPS/a.xhtml', '#x')).toEqual({ path: 'OEBPS/a.xhtml', fragment: 'x' });
    expect(resolveHref('OEBPS/a.xhtml', '../../outside.xhtml')).toBeNull();
    expect(resolveHref('OEBPS/a.xhtml', 'https://example.org/a.xhtml')).toBeNull();
  });
});
