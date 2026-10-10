import { XMLParser } from 'fast-xml-parser';
import { type DefaultTreeAdapterTypes, parse as parseHtml } from 'parse5';
import { type CoverExtension, MAX_COVER_BYTES, imageType } from '../lib/images.js';
import {
  type Segment,
  countWords,
  expandSelfClosingTags,
  htmlToText,
  plainTextToParagraphs,
  splitHtml,
} from './normalize.js';
import { ZipError, type ZipArchive, openZip } from './zip.js';

type Element = DefaultTreeAdapterTypes.Element;
type ParentNode = DefaultTreeAdapterTypes.ParentNode;

export interface EpubChapter {
  title: string;
  text: string;
  wordCount: number;
}

export interface ParsedEpub {
  title: string;
  author: string | null;
  description: string | null;
  tags: string[];
  cover: { bytes: Uint8Array; extension: CoverExtension } | null;
  chapters: EpubChapter[];
}

/** Why a file can't be imported; `message` is safe to show. */
export class EpubError extends Error {
  override readonly name = 'EpubError';
}

const NOT_AN_EPUB = "This file isn't a valid EPUB";
export const EPUB_MESSAGES = {
  notEpub: `${NOT_AN_EPUB}.`,
  noContainer: `${NOT_AN_EPUB}: it has no META-INF/container.xml.`,
  noPackage: `${NOT_AN_EPUB}: its package document (OPF) is missing or unreadable.`,
  noChapters: 'This EPUB has no chapters with text to read.',
} as const;

/** Longest title, author or chapter title kept; longer ones end with an ellipsis. */
const MAX_NAME_LENGTH = 300;
const MAX_TAGS = 30;
const MAX_TAG_LENGTH = 60;

const HTML_TYPES = new Set(['application/xhtml+xml', 'text/html']);
const NCX_TYPE = 'application/x-dtbncx+xml';

// Elements that may repeat, so they always parse as arrays.
const REPEATED = new Set([
  'rootfile',
  'title',
  'creator',
  'subject',
  'description',
  'meta',
  'item',
  'itemref',
  'reference',
  'navPoint',
]);
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  htmlEntities: true,
  ignoreDeclaration: true,
  ignorePiTags: true,
  isArray: (name) => REPEATED.has(name),
});

type XmlNode = Record<string, unknown>;

/** XML without its DOCTYPE, so no internal subset can declare (exploding) entities. */
function parseXml(text: string): XmlNode {
  const withoutDoctype = text.replace(/<!DOCTYPE[^[>]*(\[[\s\S]*?\])?\s*>/i, '');
  return xmlParser.parse(withoutDoctype) as XmlNode;
}

const asList = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
const child = (node: unknown, name: string): unknown =>
  typeof node === 'object' && node !== null ? (node as XmlNode)[name] : undefined;
const attr = (node: unknown, name: string): string | null => {
  const value = child(node, `@${name}`);
  return typeof value === 'string' ? value : null;
};
function textOf(node: unknown): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number' || typeof node === 'boolean') return String(node);
  const text = child(node, '#text');
  return typeof text === 'string' || typeof text === 'number' ? String(text) : '';
}

/** Whitespace collapsed to single spaces, trimmed. */
const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();

function clip(text: string, max = MAX_NAME_LENGTH): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Text of a file, by its byte-order mark, XML declaration or meta charset; else UTF-8. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes);
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  const declared =
    /^\s*<\?xml[^>]*encoding\s*=\s*["']([\w.:-]+)["']/.exec(head)?.[1] ??
    /<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i.exec(head)?.[1];
  try {
    return new TextDecoder(declared ?? 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes); // an encoding name we don't know
  }
}

interface Reference {
  path: string;
  fragment: string | null;
}

/**
 * Resolves an href found in the file at `from` to a path inside the archive, or null
 * for external links and paths that climb out of the archive.
 */
export function resolveHref(from: string, href: string): Reference | null {
  const hash = href.indexOf('#');
  const target = (hash === -1 ? href : href.slice(0, hash)).replace(/\?.*$/, '');
  const fragment = hash === -1 ? null : safeDecode(href.slice(hash + 1)) || null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return null; // http:, mailto:, data:, …
  if (target === '') return { path: from, fragment };
  const decoded = safeDecode(target);
  const folder = from.slice(0, from.lastIndexOf('/') + 1);
  const joined = archivePath(decoded.startsWith('/') ? decoded.slice(1) : folder + decoded);
  return joined === null ? null : { path: joined, fragment };
}

/** A path inside the archive with `.` and `..` resolved; null when it climbs out. */
function archivePath(path: string): string | null {
  const segments: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment !== '..') segments.push(segment);
    else if (segments.pop() === undefined) return null;
  }
  return segments.join('/');
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

interface ManifestItem {
  id: string;
  path: string;
  mediaType: string;
  properties: string[];
}

interface Package {
  path: string;
  metadata: XmlNode;
  manifest: Map<string, ManifestItem>;
  /** Linear spine documents, in reading order. */
  spine: ManifestItem[];
  ncxId: string | null;
  guide: unknown[];
}

interface TocEntry extends Reference {
  title: string;
}

/**
 * Reads an EPUB 2 or 3 file: `container.xml` → the package document (OPF) →
 * metadata, the spine's reading order and chapter titles from the navigation document
 * or NCX, and the cover image when there is one. Chapter text is normalized like
 * scraped chapters (13.3). Throws EpubError with a message for the reader.
 */
export async function parseEpub(
  bytes: Uint8Array,
  options: { fallbackTitle: string },
): Promise<ParsedEpub> {
  let archive: ZipArchive;
  try {
    archive = openZip(bytes);
  } catch (error) {
    if (error instanceof ZipError) throw new EpubError(error.message, { cause: error });
    throw error;
  }

  const mimetype = await archive.read('mimetype');
  if (mimetype && collapse(new TextDecoder('latin1').decode(mimetype)) !== 'application/epub+zip') {
    throw new EpubError(EPUB_MESSAGES.notEpub);
  }
  const pkg = await readPackage(archive);
  const toc = await readToc(archive, pkg);
  const chapters = await readChapters(archive, pkg.spine, toc);
  if (chapters.length === 0) throw new EpubError(EPUB_MESSAGES.noChapters);

  return {
    ...readMetadata(pkg.metadata, options.fallbackTitle),
    cover: await readCover(archive, pkg),
    chapters,
  };
}

async function readXml(archive: ZipArchive, path: string): Promise<XmlNode | null> {
  const bytes = await archive.read(path);
  if (!bytes) return null;
  try {
    return parseXml(decodeText(bytes));
  } catch {
    return null;
  }
}

async function readPackage(archive: ZipArchive): Promise<Package> {
  const container = await readXml(archive, 'META-INF/container.xml');
  if (!container) throw new EpubError(EPUB_MESSAGES.noContainer);
  const rootfiles = asList(child(child(child(container, 'container'), 'rootfiles'), 'rootfile'));
  const rootfile =
    rootfiles.find((file) => attr(file, 'media-type') === 'application/oebps-package+xml') ??
    rootfiles[0];
  const fullPath = attr(rootfile, 'full-path');
  const path = fullPath === null ? null : resolveHref('', fullPath)?.path;
  const opf = path ? await readXml(archive, path) : null;
  const root = child(opf, 'package');
  if (!path || !root) throw new EpubError(EPUB_MESSAGES.noPackage);

  const manifest = new Map<string, ManifestItem>();
  for (const item of asList(child(child(root, 'manifest'), 'item'))) {
    const id = attr(item, 'id');
    const href = attr(item, 'href');
    const target = href === null ? null : resolveHref(path, href);
    if (id === null || !target) continue;
    manifest.set(id, {
      id,
      path: archive.resolve(target.path) ?? target.path,
      mediaType: (attr(item, 'media-type') ?? '').toLowerCase(),
      properties: (attr(item, 'properties') ?? '').split(/\s+/).filter(Boolean),
    });
  }

  // Contents pages are navigation, not chapters: the nav document and the guide's "toc".
  const guide = asList(child(child(root, 'guide'), 'reference'));
  const contentsPages = new Set(
    guide
      .filter((reference) => attr(reference, 'type')?.toLowerCase() === 'toc')
      .map((reference) => resolveHref(path, attr(reference, 'href') ?? '')?.path)
      .map((page) => (page === undefined ? null : (archive.resolve(page) ?? page))),
  );

  const spineNode = child(root, 'spine');
  const spine: ManifestItem[] = [];
  for (const itemref of asList(child(spineNode, 'itemref'))) {
    const item = manifest.get(attr(itemref, 'idref') ?? '');
    if (!item || attr(itemref, 'linear') === 'no') continue;
    if (item.properties.includes('nav') || contentsPages.has(item.path)) continue;
    const html = HTML_TYPES.has(item.mediaType) || /\.x?html?$/i.test(item.path);
    if (html && !spine.includes(item)) spine.push(item);
  }

  const metadata = child(root, 'metadata');
  return {
    path,
    metadata: typeof metadata === 'object' && metadata !== null ? (metadata as XmlNode) : {},
    manifest,
    spine,
    ncxId: attr(spineNode, 'toc'),
    guide,
  };
}

/** The table of contents, flattened in reading order: EPUB 3's nav, else EPUB 2's NCX. */
async function readToc(archive: ZipArchive, pkg: Package): Promise<TocEntry[]> {
  const items = [...pkg.manifest.values()];
  const nav = items.find((item) => item.properties.includes('nav'));
  if (nav) {
    const bytes = await archive.read(nav.path);
    const entries = bytes ? navEntries(nav.path, decodeText(bytes)) : [];
    if (entries.length > 0) return entries;
  }
  const ncx =
    (pkg.ncxId === null ? undefined : pkg.manifest.get(pkg.ncxId)) ??
    items.find((item) => item.mediaType === NCX_TYPE);
  if (!ncx) return [];
  const document = await readXml(archive, ncx.path);
  const entries: TocEntry[] = [];
  const visit = (points: unknown) => {
    for (const point of asList(points)) {
      const title = collapse(textOf(child(child(point, 'navLabel'), 'text')));
      const src = attr(child(point, 'content'), 'src');
      const target = src === null ? null : resolveHref(ncx.path, src);
      if (target) entries.push({ ...target, title });
      visit(child(point, 'navPoint'));
    }
  };
  visit(child(child(child(document, 'ncx'), 'navMap'), 'navPoint'));
  return entries;
}

function elements(parent: ParentNode): Element[] {
  return parent.childNodes.filter((node): node is Element => 'tagName' in node);
}

function* descendants(parent: ParentNode): Generator<Element> {
  for (const element of elements(parent)) {
    yield element;
    yield* descendants(element);
  }
}

const attribute = (element: Element, name: string) =>
  element.attrs.find((item) => item.name === name)?.value ?? null;

function textContent(node: ParentNode): string {
  return node.childNodes
    .map((item) =>
      item.nodeName === '#text'
        ? (item as DefaultTreeAdapterTypes.TextNode).value
        : 'childNodes' in item
          ? textContent(item)
          : '',
    )
    .join('');
}

/** The entries of an EPUB 3 navigation document's `<nav epub:type="toc">`. */
function navEntries(path: string, xhtml: string): TocEntry[] {
  const document = parseHtml(expandSelfClosingTags(xhtml));
  const navs = [...descendants(document)].filter((element) => element.tagName === 'nav');
  const toc =
    navs.find((nav) => (attribute(nav, 'epub:type') ?? '').split(/\s+/).includes('toc')) ?? navs[0];
  const list = toc ? [...descendants(toc)].find((element) => element.tagName === 'ol') : undefined;
  const entries: TocEntry[] = [];
  const visit = (ol: Element) => {
    for (const li of elements(ol).filter((element) => element.tagName === 'li')) {
      const link = elements(li).find((element) => element.tagName === 'a');
      const href = link ? attribute(link, 'href') : null;
      const target = href === null ? null : resolveHref(path, href);
      if (link && target) entries.push({ ...target, title: collapse(textContent(link)) });
      const nested = elements(li).find((element) => element.tagName === 'ol');
      if (nested) visit(nested);
    }
  };
  if (list) visit(list);
  return entries;
}

interface Draft {
  title: string | null;
  heading: string | null;
  parts: string[];
}

/**
 * Chapters from the spine, titled by the table of contents. A document the
 * contents point to starts a chapter, and so does each anchor they point to inside a
 * document (several chapters in one file). A document they don't mention continues the
 * chapter before it (a chapter split into files), unless it starts with a heading; without
 * a table of contents, each document is a chapter. Untitled chapters take their first
 * heading, else "Chapter N". Chapters without text (covers, illustrations) are skipped.
 */
async function readChapters(
  archive: ZipArchive,
  spine: ManifestItem[],
  toc: TocEntry[],
): Promise<EpubChapter[]> {
  const byPath = new Map<string, TocEntry[]>();
  for (const entry of toc) {
    const path = archive.resolve(entry.path) ?? entry.path;
    const entries = byPath.get(path) ?? [];
    if (!entries.some((other) => other.fragment === entry.fragment)) entries.push(entry);
    byPath.set(path, entries);
  }
  const useToc = spine.some((item) => byPath.has(item.path));

  const drafts: Draft[] = [];
  const start = (title: string | null, segment: Segment) => {
    drafts.push({
      title: title || null,
      heading: segment.heading,
      parts: segment.text ? [segment.text] : [],
    });
  };

  for (const item of spine) {
    const bytes = await archive.read(item.path);
    if (!bytes) continue;
    const entries = byPath.get(item.path) ?? [];
    const anchors = new Map<string, string>();
    for (const entry of entries) {
      if (entry.fragment !== null) anchors.set(entry.fragment, entry.title);
    }
    const whole = entries.find((entry) => entry.fragment === null);
    const { before, sections } = splitHtml(
      expandSelfClosingTags(decodeText(bytes)),
      new Set(anchors.keys()),
    );

    const previous = drafts.at(-1);
    if (whole) start(whole.title, before);
    else if (previous && useToc && before.text && !before.startsWithHeading) {
      previous.parts.push(before.text);
    } else if (before.text) start(null, before);
    for (const { id, segment } of sections) start(anchors.get(id) ?? null, segment);
  }

  const chapters: EpubChapter[] = [];
  for (const draft of drafts) {
    const text = draft.parts.join('\n\n');
    if (!text) continue;
    const title = clip(draft.title ?? draft.heading ?? `Chapter ${chapters.length + 1}`);
    const body = withoutRepeatedTitle(text, title);
    chapters.push({ title, text: body, wordCount: countWords(body) });
  }
  return chapters;
}

/** Drops a first paragraph that only repeats the title, which the reader already shows. */
function withoutRepeatedTitle(text: string, title: string): string {
  const end = text.indexOf('\n\n');
  if (end === -1) return text;
  const first = collapse(text.slice(0, end)).toLowerCase();
  return first === collapse(title).toLowerCase() ? text.slice(end + 2) : text;
}

function readMetadata(
  metadata: XmlNode,
  fallbackTitle: string,
): Pick<ParsedEpub, 'title' | 'author' | 'description' | 'tags'> {
  const metas = asList(metadata.meta);
  /** EPUB 3 refinements: `<meta refines="#id" property="…">value</meta>`. */
  const refinement = (node: unknown, property: string) => {
    const id = attr(node, 'id');
    if (id === null) return null;
    const meta = metas.find(
      (item) => attr(item, 'refines') === `#${id}` && attr(item, 'property') === property,
    );
    return meta === undefined ? null : collapse(textOf(meta));
  };

  const titles = asList(metadata.title).filter((node) => collapse(textOf(node)) !== '');
  const mainTitle = titles.find((node) => refinement(node, 'title-type') === 'main') ?? titles[0];
  const title = collapse(textOf(mainTitle)) || collapse(fallbackTitle) || 'Untitled';

  const creators = asList(metadata.creator).filter((node) => collapse(textOf(node)) !== '');
  const role = (node: unknown) => attr(node, 'role') ?? refinement(node, 'role');
  const authors = creators.filter((node) => [null, 'aut'].includes(role(node)));
  const names = [
    ...new Set((authors.length > 0 ? authors : creators).map((node) => collapse(textOf(node)))),
  ];

  const description = asList(metadata.description)
    .map((node) => textOf(node).trim())
    .find((text) => text !== '');

  const tags = new Map<string, string>();
  for (const node of asList(metadata.subject)) {
    const tag = collapse(textOf(node));
    if (tag !== '' && tag.length <= MAX_TAG_LENGTH && !tags.has(tag.toLowerCase())) {
      tags.set(tag.toLowerCase(), tag);
    }
  }

  return {
    title: clip(title),
    author: names.length > 0 ? clip(names.join(', ')) : null,
    description: description ? descriptionText(description) || null : null,
    tags: [...tags.values()].slice(0, MAX_TAGS),
  };
}

/** Descriptions are often HTML (escaped in the OPF); plain ones keep their paragraphs. */
function descriptionText(text: string): string {
  return /<\/?[a-z][^>]*>/i.test(text) ? htmlToText(text) : plainTextToParagraphs(text);
}

/**
 * The cover image: EPUB 3's `cover-image` item, EPUB 2's `<meta name="cover">`, the
 * image on the guide's cover page, or an image item named like a cover. The first that
 * is a JPEG, PNG, WebP or GIF of at most 8 MB wins; without one, the novel has no cover.
 */
async function readCover(archive: ZipArchive, pkg: Package): Promise<ParsedEpub['cover']> {
  const items = [...pkg.manifest.values()];
  const candidates: string[] = [];
  for (const item of items) {
    if (item.properties.includes('cover-image')) candidates.push(item.path);
  }
  for (const meta of asList(pkg.metadata.meta)) {
    const content = attr(meta, 'name') === 'cover' ? attr(meta, 'content') : null;
    if (content === null) continue;
    const item = pkg.manifest.get(content);
    const path = item?.path ?? resolveHref(pkg.path, content)?.path;
    if (path) candidates.push(path);
  }
  for (const reference of pkg.guide) {
    const href =
      attr(reference, 'type')?.toLowerCase() === 'cover' ? attr(reference, 'href') : null;
    const page = href === null ? null : resolveHref(pkg.path, href);
    const image = page ? await coverPageImage(archive, page.path) : null;
    if (image) candidates.push(image);
  }
  for (const item of items) {
    if (item.mediaType.startsWith('image/') && /cover/i.test(`${item.id} ${item.path}`)) {
      candidates.push(item.path);
    }
  }

  for (const path of new Set(candidates)) {
    const bytes = await archive.read(path);
    const extension = bytes && bytes.length <= MAX_COVER_BYTES ? imageType(bytes) : null;
    if (bytes && extension) return { bytes, extension };
  }
  return null;
}

/** The first image on a cover page (`<img src>` or SVG `<image href>`). */
async function coverPageImage(archive: ZipArchive, path: string): Promise<string | null> {
  const bytes = await archive.read(path);
  if (!bytes) return null;
  const document = parseHtml(expandSelfClosingTags(decodeText(bytes)));
  for (const element of descendants(document)) {
    const source =
      element.tagName === 'img'
        ? attribute(element, 'src')
        : element.tagName === 'image'
          ? (attribute(element, 'href') ?? attribute(element, 'xlink:href'))
          : null;
    const target = source === null ? null : resolveHref(path, source);
    if (target) return target.path;
  }
  return null;
}
