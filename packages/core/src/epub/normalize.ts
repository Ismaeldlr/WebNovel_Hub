/**
 * Chapter HTML to normalized plain text, for imported and scraped chapters alike. It
 * follows `fixtures/normalization/README.md` and passes its fixture pairs. parse5 builds
 * the tree the HTML5 specification describes.
 */
import { type DefaultTreeAdapterTypes, parse } from 'parse5';

type Element = DefaultTreeAdapterTypes.Element;
type ParentNode = DefaultTreeAdapterTypes.ParentNode;

/** Removed together with everything inside them. */
const DROPPED_TAGS = new Set([
  'audio',
  'button',
  'canvas',
  'embed',
  'form',
  'head',
  'iframe',
  'input',
  'ins',
  'nav',
  'noscript',
  'object',
  'script',
  'select',
  'style',
  'svg',
  'template',
  'textarea',
  'video',
]);
/** Elements with one of these classes are ads or comment sections, and are removed. */
const DROPPED_CLASSES = new Set([
  'ad',
  'ads',
  'adsbygoogle',
  'advert',
  'advertisement',
  'comments',
  'comment-section',
]);
/** Each starts a new paragraph. */
const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'center',
  'dd',
  'details',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'ol',
  'p',
  'pre',
  'section',
  'summary',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
]);
const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
/** Elements without content, which XHTML may write as `<br/>` and HTML understands. */
const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

// Invisible characters that would otherwise survive whitespace collapsing.
const INVISIBLE = /[\xAD\u200B-\u200D\u2060\uFEFF]/g;
const HIDDEN_STYLE = /display\s*:\s*none|visibility\s*:\s*hidden/i;
// What separates words: Unicode spaces and line breaks, including the separator controls
// U+001C to U+001F.
const WHITESPACE =
  // eslint-disable-next-line no-control-regex
  /[\t\n\v\f\r \x1C-\x1F\x85\xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+/;
/** Paragraph boundary marker; the HTML parser never leaves U+0000 in text. */
const BREAK = '\u0000';

const words = (text: string) => text.split(WHITESPACE).filter(Boolean);

/** Normalized text: paragraphs separated by a blank line, no leading/trailing space. */
export function htmlToText(html: string): string {
  return splitHtml(html).before.text;
}

export function countWords(text: string): number {
  return words(text).length;
}

/**
 * Plain text (not HTML), such as an OPF description, where line breaks are only
 * wrapping: blank lines separate paragraphs, and other whitespace collapses.
 */
export function plainTextToParagraphs(text: string): string {
  return text
    .split(/\r?\n[^\S\n]*(?:\r?\n\s*)+/)
    .map((paragraph) => words(paragraph.replace(INVISIBLE, '')).join(' '))
    .filter(Boolean)
    .join('\n\n');
}

/** A stretch of a document: its normalized text and how it begins. */
export interface Segment {
  text: string;
  /** The text of its first heading (h1–h6), whitespace collapsed; null without one. */
  heading: string | null;
  /** Whether its first words are inside a heading, as a chapter's usually are. */
  startsWithHeading: boolean;
}

export interface SplitDocument {
  /** Everything before the first split point (all of it without one). */
  before: Segment;
  /** One segment per split point found, in document order, from that point on. */
  sections: { id: string; segment: Segment }[];
}

/**
 * Normalizes a document, split at the elements whose `id` (or an `<a>`'s `name`) is in
 * `splitIds`: several chapters can share one file, with the table of contents pointing
 * at each one's anchor. Split points that are missing, hidden or inside dropped elements
 * don't split anything.
 */
export function splitHtml(html: string, splitIds: ReadonlySet<string> = new Set()): SplitDocument {
  const body = findBody(parse(html));
  const walker = new Walker(splitIds);
  if (body) {
    const bodyId = anchorId(body, splitIds);
    if (bodyId !== null) walker.split(bodyId);
    walker.walk(body);
  }
  const [first, ...rest] = walker.segments;
  return {
    before: finish(first ?? newSegment(null)),
    sections: rest.map((segment) => ({ id: segment.id ?? '', segment: finish(segment) })),
  };
}

/**
 * Rewrites XHTML's self-closed elements (`<div/>`, `<a id="x"/>`, `<title/>`) as an
 * empty pair, which is what they mean. The HTML parser would otherwise open them, and
 * an empty `<title/>` or `<script/>` would swallow the rest of the document as text.
 */
export function expandSelfClosingTags(xhtml: string): string {
  return xhtml.replace(
    /<([A-Za-z][^\s/>]*)((?:\s+[^\s/>"'=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/>/g,
    (_match, tag: string, attributes: string) =>
      VOID_TAGS.has(tag.toLowerCase()) ? `<${tag}${attributes}>` : `<${tag}${attributes}></${tag}>`,
  );
}

interface RawSegment {
  id: string | null;
  pieces: string[];
  heading: string | null;
  startsWithHeading: boolean | null;
}

const newSegment = (id: string | null): RawSegment => ({
  id,
  pieces: [],
  heading: null,
  startsWithHeading: null,
});

function finish(segment: RawSegment): Segment {
  return {
    text: toParagraphs(segment.pieces.join('')),
    heading: segment.heading,
    startsWithHeading: segment.startsWithHeading === true,
  };
}

class Walker {
  readonly segments: RawSegment[] = [newSegment(null)];
  private headingDepth = 0;
  private readonly used = new Set<string>();
  private readonly splitIds: ReadonlySet<string>;

  constructor(splitIds: ReadonlySet<string>) {
    this.splitIds = splitIds;
  }

  private get current(): RawSegment {
    return this.segments[this.segments.length - 1] as RawSegment;
  }

  split(id: string): void {
    this.used.add(id);
    this.segments.push(newSegment(id));
  }

  walk(parent: ParentNode): void {
    for (const node of parent.childNodes) {
      if (node.nodeName === '#text') {
        // Source newlines are just whitespace in HTML; only <br> makes a line break.
        const text = (node as DefaultTreeAdapterTypes.TextNode).value.replace(/\n/g, ' ');
        const segment = this.current;
        if (segment.startsWithHeading === null && words(text.replace(INVISIBLE, '')).length > 0) {
          segment.startsWithHeading = this.headingDepth > 0;
        }
        segment.pieces.push(text);
        continue;
      }
      if (node.nodeName.startsWith('#')) continue; // comments, doctypes
      const element = node as Element;
      const tag = element.tagName;
      if (tag === 'br') {
        this.current.pieces.push('\n');
        continue;
      }
      if (DROPPED_TAGS.has(tag) || isHidden(element)) continue;

      const id = anchorId(element, this.splitIds);
      if (id !== null && !this.used.has(id)) this.split(id);

      if (HEADING_TAGS.has(tag)) this.walkHeading(element);
      else if (BLOCK_TAGS.has(tag)) this.walkBlock(element);
      else this.walk(element);
    }
  }

  private walkBlock(element: Element): void {
    this.current.pieces.push(BREAK);
    this.walk(element);
    this.current.pieces.push(BREAK);
  }

  private walkHeading(element: Element): void {
    const segment = this.current;
    const start = segment.pieces.length;
    this.headingDepth += 1;
    this.walkBlock(element);
    this.headingDepth -= 1;
    // A split point inside the heading moved the text to a new segment; that one
    // gets no heading here, and its title comes from the table of contents.
    if (segment === this.current && segment.heading === null) {
      const raw = segment.pieces.slice(start).join('').replaceAll(BREAK, ' ');
      const text = words(raw.replace(INVISIBLE, '')).join(' ');
      if (text !== '') segment.heading = text;
    }
  }
}

/** Hidden by its own attributes (not by page CSS, which only an adapter can see). */
function isHidden(element: Element): boolean {
  let classes: string | undefined;
  for (const { name, value } of element.attrs) {
    if (name === 'hidden') return true;
    if (name === 'aria-hidden' && value === 'true') return true;
    if (name === 'style' && HIDDEN_STYLE.test(value)) return true;
    if (name === 'class') classes = value;
  }
  return classes !== undefined && words(classes.toLowerCase()).some((c) => DROPPED_CLASSES.has(c));
}

function anchorId(element: Element, splitIds: ReadonlySet<string>): string | null {
  if (splitIds.size === 0) return null;
  for (const { name, value } of element.attrs) {
    if ((name === 'id' || (name === 'name' && element.tagName === 'a')) && splitIds.has(value)) {
      return value;
    }
  }
  return null;
}

function findBody(document: DefaultTreeAdapterTypes.Document): Element | null {
  const html = document.childNodes.find((node) => node.nodeName === 'html') as Element | undefined;
  return (html?.childNodes.find((node) => node.nodeName === 'body') as Element | undefined) ?? null;
}

/** Rules 6–8: paragraphs from the walked text (BREAK marks block boundaries). */
function toParagraphs(raw: string): string {
  const text = raw.replace(INVISIBLE, '');
  const paragraphs: string[] = [];
  for (const block of text.split(BREAK)) {
    let lines: string[] = [];
    for (const rawLine of block.split('\n')) {
      const line = words(rawLine).join(' ');
      if (line) {
        lines.push(line);
      } else if (lines.length > 0) {
        // A blank line (e.g. <br><br>) ends the paragraph.
        paragraphs.push(lines.join('\n'));
        lines = [];
      }
    }
    if (lines.length > 0) paragraphs.push(lines.join('\n'));
  }
  return paragraphs.join('\n\n');
}
