import { chapterParagraphs } from '@webnovel-hub/shared';
import type { CoverExtension } from '../lib/images.js';
import type { ZipFile } from './zip-writer.js';

/** What the export knows of the novel. */
export interface EpubBook {
  /** The novel's id, which also identifies the book: `urn:uuid:<id>`. */
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  tags: string[];
  /** The site the chapters came from; null for an EPUB import. */
  source: { name: string; url: string } | null;
  cover: { bytes: Uint8Array; extension: CoverExtension } | null;
  /** Every chapter of the novel, stored or not. */
  totalChapters: number;
  exportedAt: Date;
}

/** A stored chapter; they come in reading order. */
export interface EpubChapterText {
  number: number;
  title: string;
  /** Normalized plain text. */
  content: string;
}

type ChapterEntry = Pick<EpubChapterText, 'number' | 'title'>;

const MEDIA_TYPES: Record<CoverExtension, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

/** At most this many gaps are listed on the title page. */
const MAX_GAPS_LISTED = 12;

const char = (code: number) => String.fromCodePoint(code);
/** Characters XML 1.0 can't hold: most controls, lone surrogates, U+FFFE and U+FFFF. */
const NOT_XML = new RegExp(
  `[^\\t\\n\\r\\x20-${char(0xd7ff)}${char(0xe000)}-${char(0xfffd)}${char(0x10000)}-${char(0x10ffff)}]`,
  'gu',
);
const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

/** Text as XML character data or an attribute value. Scraped text is never markup. */
const xml = (text: string) =>
  text.replace(NOT_XML, '').replace(/[&<>"']/g, (found) => ENTITIES[found] ?? found);

/** Plain text as paragraphs, keeping its line breaks, like the reader shows it. */
const paragraphs = (text: string, className?: string) =>
  chapterParagraphs(text)
    .map(
      (lines) =>
        `<p${className ? ` class="${className}"` : ''}>${lines.map(xml).join('<br/>')}</p>`,
    )
    .join('\n');

const chapterHref = (number: number) => `text/chapter-${number}.xhtml`;
const chapterId = (number: number) => `chapter-${number}`;

/** An XHTML content document; chapters live one folder down and pass `../style.css`. */
function page(title: string, body: string, stylesheet = 'style.css'): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head>
<meta charset="utf-8"/>
<title>${xml(title)}</title>
<link rel="stylesheet" type="text/css" href="${stylesheet}"/>
</head>
<body>
${body}
</body>
</html>
`;
}

const CONTAINER = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;

// Plain on purpose: e-book apps apply the reader's own font, size and colours.
const STYLE = `body { margin: 0 4%; line-height: 1.5; }
h1 { font-size: 1.4em; line-height: 1.25; margin: 1.5em 0 1em; text-align: center; }
p { margin: 0 0 0.9em; }
.cover { margin: 0; padding: 0; text-align: center; }
.cover img { max-width: 100%; max-height: 100vh; }
.title-page { text-align: center; }
.title-page h1 { font-size: 1.8em; margin-top: 3em; }
.author { font-size: 1.15em; margin-bottom: 2em; }
.description { text-align: left; }
.note { font-size: 0.85em; margin-top: 1.5em; }
`;

function coverPage(book: EpubBook, extension: CoverExtension): string {
  return page(
    book.title,
    `<section class="cover" epub:type="cover">
<img src="images/cover.${extension}" alt="${xml(book.title)}"/>
</section>`,
  );
}

function chapterPage(chapter: EpubChapterText): string {
  return page(
    chapter.title,
    `<section epub:type="chapter" role="doc-chapter">
<h1>${xml(chapter.title)}</h1>
${paragraphs(chapter.content)}
</section>`,
    '../style.css',
  );
}

/** "4, 7–9, 12": the chapters from 1 to `total` missing from `present` (in order). */
function gaps(present: ChapterEntry[], total: number): string[] {
  const ranges: string[] = [];
  const add = (from: number, to: number) => ranges.push(from === to ? `${from}` : `${from}–${to}`);
  let next = 1;
  for (const { number } of present) {
    if (number > next) add(next, number - 1);
    next = number + 1;
  }
  if (next <= total) add(next, total);
  return ranges;
}

/** The title, author and description, where the book came from, and what it holds. */
function titlePage(book: EpubBook, chapters: ChapterEntry[]): string {
  const total = Math.max(book.totalChapters, chapters.at(-1)?.number ?? 0);
  const missing = gaps(chapters, total);
  const notes = [
    book.tags.length > 0 && `Tags: ${xml(book.tags.join(', '))}`,
    book.source &&
      `From ${xml(book.source.name)}: <a href="${xml(book.source.url)}">${xml(book.source.url)}</a>`,
    `${chapters.length.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} chapters, ` +
      `exported from Webnovel Hub on ${book.exportedAt.toISOString().slice(0, 10)}.`,
    missing.length > 0 &&
      `Chapters left out, as they weren't stored yet: ${missing.slice(0, MAX_GAPS_LISTED).join(', ')}` +
        `${missing.length > MAX_GAPS_LISTED ? ' and others' : ''}.`,
  ].filter((note): note is string => typeof note === 'string');
  return page(
    book.title,
    `<section class="title-page" epub:type="titlepage">
<h1>${xml(book.title)}</h1>
${book.author ? `<p class="author">${xml(book.author)}</p>` : ''}
${book.description ? paragraphs(book.description, 'description') : ''}
${notes.map((note) => `<p class="note">${note}</p>`).join('\n')}
</section>`,
  );
}

/** The table of contents (EPUB 3); the title page stands in for a book with no chapters. */
function navigationDocument(book: EpubBook, chapters: ChapterEntry[]): string {
  const entries =
    chapters.length > 0
      ? chapters.map(({ number, title }) => ({ href: chapterHref(number), title }))
      : [{ href: 'title.xhtml', title: book.title }];
  const first = entries[0]?.href ?? 'title.xhtml';
  return page(
    'Contents',
    `<nav epub:type="toc" id="toc" role="doc-toc">
<h1>Contents</h1>
<ol>
${entries.map(({ href, title }) => `<li><a href="${href}">${xml(title)}</a></li>`).join('\n')}
</ol>
</nav>
<nav epub:type="landmarks" hidden="hidden">
<ol>
${book.cover ? '<li><a epub:type="cover" href="cover.xhtml">Cover</a></li>\n' : ''}<li><a epub:type="titlepage" href="title.xhtml">Title page</a></li>
<li><a epub:type="bodymatter" href="${first}">Start reading</a></li>
</ol>
</nav>`,
  );
}

/** The same table of contents for EPUB 2 reading systems. */
function ncx(book: EpubBook, chapters: ChapterEntry[]): string {
  const entries =
    chapters.length > 0
      ? chapters.map(({ number, title }) => ({
          id: chapterId(number),
          href: chapterHref(number),
          title,
        }))
      : [{ id: 'title-page', href: 'title.xhtml', title: book.title }];
  return `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="en">
<head>
<meta name="dtb:uid" content="urn:uuid:${book.id}"/>
<meta name="dtb:depth" content="1"/>
<meta name="dtb:totalPageCount" content="0"/>
<meta name="dtb:maxPageNumber" content="0"/>
</head>
<docTitle><text>${xml(book.title)}</text></docTitle>
<navMap>
${entries
  .map(
    ({ id, href, title }, index) =>
      `<navPoint id="${id}" playOrder="${index + 1}"><navLabel><text>${xml(title)}</text></navLabel><content src="${href}"/></navPoint>`,
  )
  .join('\n')}
</navMap>
</ncx>
`;
}

/** The package document: metadata, every file, and the reading order. */
function packageDocument(book: EpubBook, chapters: ChapterEntry[]): string {
  const modified = book.exportedAt.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const cover = book.cover;
  const metadata = [
    `<dc:identifier id="book-id">urn:uuid:${book.id}</dc:identifier>`,
    `<dc:title>${xml(book.title)}</dc:title>`,
    '<dc:language>en</dc:language>',
    book.author && `<dc:creator>${xml(book.author)}</dc:creator>`,
    book.description && `<dc:description>${xml(book.description)}</dc:description>`,
    ...book.tags.map((tag) => `<dc:subject>${xml(tag)}</dc:subject>`),
    book.source && `<dc:source>${xml(book.source.url)}</dc:source>`,
    `<meta property="dcterms:modified">${modified}</meta>`,
    cover && '<meta name="cover" content="cover-image"/>',
  ];
  const manifest = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    '<item id="style" href="style.css" media-type="text/css"/>',
    cover &&
      `<item id="cover-image" href="images/cover.${cover.extension}" media-type="${MEDIA_TYPES[cover.extension]}" properties="cover-image"/>`,
    cover && '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>',
    '<item id="title-page" href="title.xhtml" media-type="application/xhtml+xml"/>',
    ...chapters.map(
      ({ number }) =>
        `<item id="${chapterId(number)}" href="${chapterHref(number)}" media-type="application/xhtml+xml"/>`,
    ),
  ];
  const spine = [
    cover && '<itemref idref="cover"/>',
    '<itemref idref="title-page"/>',
    ...chapters.map(({ number }) => `<itemref idref="${chapterId(number)}"/>`),
  ];
  const lines = (items: (string | null | false)[]) =>
    items.filter((item): item is string => typeof item === 'string' && item !== '').join('\n    ');
  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="en">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    ${lines(metadata)}
  </metadata>
  <manifest>
    ${lines(manifest)}
  </manifest>
  <spine toc="ncx">
    ${lines(spine)}
  </spine>
</package>
`;
}

/**
 * The files of an EPUB 3 book (with an EPUB 2 table of contents, for older e-readers),
 * in archive order: `mimetype` first and stored, as the format requires, then each
 * chapter as it arrives. The documents that list every chapter come last.
 */
export async function* epubFiles(
  book: EpubBook,
  chapters: AsyncIterable<EpubChapterText>,
): AsyncGenerator<ZipFile> {
  yield { name: 'mimetype', content: 'application/epub+zip', store: true };
  yield { name: 'META-INF/container.xml', content: CONTAINER };
  yield { name: 'OEBPS/style.css', content: STYLE };
  if (book.cover) {
    const { bytes, extension } = book.cover;
    // Images are compressed already.
    yield { name: `OEBPS/images/cover.${extension}`, content: bytes, store: true };
    yield { name: 'OEBPS/cover.xhtml', content: coverPage(book, extension) };
  }
  const written: ChapterEntry[] = [];
  for await (const chapter of chapters) {
    written.push({ number: chapter.number, title: chapter.title });
    yield { name: `OEBPS/${chapterHref(chapter.number)}`, content: chapterPage(chapter) };
  }
  yield { name: 'OEBPS/title.xhtml', content: titlePage(book, written) };
  yield { name: 'OEBPS/nav.xhtml', content: navigationDocument(book, written) };
  yield { name: 'OEBPS/toc.ncx', content: ncx(book, written) };
  yield { name: 'OEBPS/content.opf', content: packageDocument(book, written) };
}
