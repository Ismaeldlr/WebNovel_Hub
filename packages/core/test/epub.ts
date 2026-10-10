import { crc32, deflateRawSync, deflateSync } from 'node:zlib';
import {
  type ZipEntryHeader,
  centralDirectoryHeader,
  endOfCentralDirectory,
  localFileHeader,
} from '../src/epub/zip-writer.js';

/**
 * Builds EPUB files in memory for tests. The structures copy what real tools
 * write (Sigil and InDesign EPUB 3, Calibre and Project Gutenberg EPUB 2, split files,
 * anchors, odd tables of contents); the text is invented.
 */

export interface ZipEntry {
  name: string;
  content: string | Buffer;
  /** Deflate unless told to store; `mimetype` is always stored, as EPUB requires. */
  store?: boolean;
  /** Lies about the uncompressed size in both headers (for zip-bomb tests). */
  declaredSize?: number;
}

const MODIFIED = new Date('2025-09-27T00:00:00Z');

/**
 * A ZIP archive (no ZIP64, UTF-8 names), with the app's own headers (src/epub/zip-writer),
 * built in one piece so a test can make it lie.
 */
export function zip(entries: ZipEntry[]): Buffer {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const data = Buffer.isBuffer(entry.content)
      ? entry.content
      : Buffer.from(entry.content, 'utf8');
    const store = entry.store === true || entry.name === 'mimetype';
    const body = store ? data : deflateRawSync(data);
    const header: ZipEntryHeader = {
      name: Buffer.from(entry.name, 'utf8'),
      method: store ? 0 : 8,
      crc: crc32(data),
      compressedSize: body.length,
      size: entry.declaredSize ?? data.length,
    };
    const local = localFileHeader(header, MODIFIED);
    locals.push(local, body);
    centrals.push(centralDirectoryHeader(header, MODIFIED, offset));
    offset += local.length + body.length;
  }
  const directory = Buffer.concat(centrals);
  const end = endOfCentralDirectory(entries.length, directory.length, offset);
  return Buffer.concat([...locals, directory, end]);
}

/** A real PNG of one colour, so covers also display in the browser. */
export function png(width = 4, height = 6, rgb: [number, number, number] = [128, 32, 32]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typed = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([length, typed, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array(width).fill(rgb).flat())]);
  const pixels = Buffer.concat(Array(height).fill(row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export const CONTAINER = (opfPath = 'OEBPS/content.opf') => `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="${opfPath}" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

/** An XHTML content document as EPUB tools write it. */
export const xhtml = (title: string, body: string) => `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${title}</title><link href="../Styles/style.css" rel="stylesheet" type="text/css"/></head>
<body>
${body}
</body>
</html>`;

export interface SampleChapter {
  title: string;
  paragraphs: string[];
}

/** Invented chapters: "Chapter N" with a few short paragraphs. */
export function sampleChapters(count: number): SampleChapter[] {
  return Array.from({ length: count }, (_, index) => ({
    title: `Chapter ${index + 1}`,
    paragraphs: [
      `The lantern in room ${index + 1} flickered as the courier arrived.`,
      'She set the parcel down and listened to the rain.',
    ],
  }));
}

/**
 * A tidy EPUB 3 (the shape Sigil and most converters write): a nav document, one file
 * per chapter with its title as an <h1>, a cover image and a cover page.
 */
export function sampleEpub(
  options: {
    title?: string;
    author?: string;
    description?: string;
    subjects?: string[];
    chapters?: SampleChapter[];
    cover?: Buffer | null;
    /** Changes the file's bytes (and so its hash) without changing what it says. */
    salt?: string;
  } = {},
): Buffer {
  const {
    title = 'The Lantern Courier',
    author = 'Ada Quill',
    description = '<p>A courier carries <b>light</b> between towns.</p><p>Rain follows.</p>',
    subjects = ['Fantasy', 'Adventure'],
    chapters = sampleChapters(3),
    cover = png(),
    salt = '',
  } = options;
  const escape = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const files = chapters.map(
    (_, index) => `Text/chapter${String(index + 1).padStart(3, '0')}.xhtml`,
  );
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package version="3.0" unique-identifier="BookId" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">urn:uuid:3f1c2b1e-0000-4000-8000-${salt.padEnd(12, '0').slice(0, 12)}</dc:identifier>
    <dc:title id="t1">${escape(title)}</dc:title>
    <meta refines="#t1" property="title-type">main</meta>
    <dc:creator id="c1">${escape(author)}</dc:creator>
    <meta refines="#c1" property="role" scheme="marc:relators">aut</meta>
    <dc:language>en</dc:language>
    <dc:description>${escape(description)}</dc:description>
    ${subjects.map((subject) => `<dc:subject>${escape(subject)}</dc:subject>`).join('\n    ')}
    <meta property="dcterms:modified">2026-09-27T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    ${cover ? '<item id="cover-img" href="Images/cover.png" media-type="image/png" properties="cover-image"/>' : ''}
    ${cover ? '<item id="cover" href="Text/cover.xhtml" media-type="application/xhtml+xml"/>' : ''}
    ${files.map((file, index) => `<item id="ch${index + 1}" href="${file}" media-type="application/xhtml+xml"/>`).join('\n    ')}
  </manifest>
  <spine>
    ${cover ? '<itemref idref="cover"/>' : ''}
    <itemref idref="nav" linear="yes"/>
    ${files.map((_, index) => `<itemref idref="ch${index + 1}"/>`).join('\n    ')}
  </spine>
</package>`;
  const nav = xhtml(
    'Contents',
    `<h1>Contents</h1>
<nav epub:type="toc" id="toc"><ol>
${chapters.map((chapter, index) => `  <li><a href="${files[index]}">${escape(chapter.title)}</a></li>`).join('\n')}
</ol></nav>`,
  );
  return zip([
    { name: 'mimetype', content: 'application/epub+zip' },
    { name: 'META-INF/container.xml', content: CONTAINER() },
    { name: 'OEBPS/content.opf', content: opf },
    { name: 'OEBPS/nav.xhtml', content: nav },
    ...(cover
      ? [
          { name: 'OEBPS/Images/cover.png', content: cover, store: true },
          {
            name: 'OEBPS/Text/cover.xhtml',
            content: xhtml('Cover', '<div><img src="../Images/cover.png" alt="Cover"/></div>'),
          },
        ]
      : []),
    ...chapters.map((chapter, index) => ({
      name: `OEBPS/${files[index]}`,
      content: xhtml(
        escape(title),
        `<h1>${escape(chapter.title)}</h1>\n${chapter.paragraphs.map((text) => `<p>${escape(text)}</p>`).join('\n')}`,
      ),
    })),
  ]);
}
