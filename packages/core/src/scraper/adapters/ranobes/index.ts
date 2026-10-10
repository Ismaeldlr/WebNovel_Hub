// Ranobes: server-rendered pages. The novel page holds the metadata (partly as JSON-LD).
// The chapter index is a separate page, 25 chapters a page, newest first, with its data
// as JSON in `window.__DATA__`; every page is read and the result reversed.
//
// Canonical URLs are the chapter index, https://ranobes.net/chapters/<id>/: it works with
// the id alone (a novel page without its slug is a soft 404), and it links the novel page
// (`book_link`), which is followed for the metadata. ranobes.top serves the same site.
//
// DDoS-Guard answers plain HTTP clients with a challenge page, while a browser passes its
// check on its own in a few seconds. So every page loads in the app's web view, as the web
// view's own browser, and the check's cookies carry over to the next page. Requests are
// spaced like WebToEpub's (8 s), which the site tolerates.
import { StructureChanged, UnsupportedUrl } from '../../errors.js';
import type { SourceSession } from '../../session.js';
import { parseHttpUrl, resolveUrl } from '../../urls.js';
import { Adapter, type ChapterHtml, type ChapterRef, type NovelMeta } from '../base.js';
import * as html from '../html.js';
import * as sel from './selectors.js';

const ORIGIN = 'https://ranobes.net';
const NOVEL_ID_PATTERNS = [
  /^\/novels\/(\d+)(?:-[^/]*)?\.html$/, // novel page
  /^\/chapters\/(\d+)(?:\/.*)?$/, // chapter index
  /^\/[^/]+-(\d+)\/\d+\.html$/, // chapter page: /<slug>-<id>/<chapter id>.html
];
/** A chapter page's own id; the slug before it changes when the novel is renamed. */
const CHAPTER_ID = /^\/[^/]+-\d+\/(\d+)\.html$/;
/** A limit on index pages (25 chapters each), in case a site never stops answering. */
const MAX_INDEX_PAGES = 1000;

type IndexData = Record<string, unknown> & { chapters: unknown[] };

export class RanobesAdapter extends Adapter {
  readonly source = 'ranobes';
  readonly name = 'Ranobes';
  readonly homeUrl = ORIGIN;
  readonly hosts = new Set(['ranobes.net', 'www.ranobes.net', 'ranobes.top', 'www.ranobes.top']);
  override readonly requestDelay = 8_000;

  canonicalize(url: string): string {
    return `${ORIGIN}/chapters/${this.novelId(url)}/`;
  }

  override chapterKey(url: string): string {
    const match = CHAPTER_ID.exec(parseHttpUrl(url).pathname);
    return match ? `chapter/${match[1]}` : url;
  }

  async fetchNovel(session: SourceSession, url: string): Promise<NovelMeta> {
    const index = await this.indexPage(session, this.canonicalize(url));
    const bookLink =
      typeof index.book_link === 'string' ? resolveUrl(index.book_link, ORIGIN) : null;
    if (!bookLink) throw new StructureChanged(`no book_link in the chapter index at ${url}`);
    const page = await load(session, onOrigin(bookLink), true);
    const root = html.parse(page.text);
    const data = novelJsonLd(root);

    const title = html.clean(data.name) || ownText(root.querySelector(sel.TITLE));
    if (!title)
      throw new StructureChanged(`no novel title (JSON-LD name or ${sel.TITLE}) at ${url}`);

    const node = root.querySelector(sel.DESCRIPTION);
    const description =
      html.description(node, sel.DESCRIPTION_TOGGLE) ??
      html.attribute(root.querySelector(sel.DESCRIPTION_FALLBACK), 'content');
    const cover =
      html.clean(data.image) ??
      html.attribute(root.querySelector(sel.COVER_META), 'content') ??
      html.attribute(root.querySelector(sel.COVER), 'src');
    const author = data.author as Record<string, unknown> | undefined;
    return {
      title,
      author: typeof author === 'object' && author !== null ? html.clean(author.name) : null,
      description,
      tags: html.texts(root.querySelectorAll(sel.GENRES)),
      coverUrl: cover ? resolveUrl(cover, page.url) : null,
    };
  }

  async fetchChapterList(session: SourceSession, url: string): Promise<ChapterRef[]> {
    const novelId = this.novelId(url);
    const first = await this.indexPage(session, this.canonicalize(url));
    const pages =
      typeof first.pages_count === 'number' && first.pages_count > 0 ? first.pages_count : 1;
    const entries = indexEntries(first, url);
    for (let number = 2; number <= Math.min(pages, MAX_INDEX_PAGES); number += 1) {
      const data = await this.indexPage(session, `${ORIGIN}/chapters/${novelId}/page/${number}/`);
      entries.push(...indexEntries(data, url));
    }

    // Each page is newest first: reversed for reading order, without repeats (a chapter
    // released while the pages were read can shift one onto the next page).
    const chapters = new Map<string, ChapterRef>();
    for (const entry of entries.reverse()) {
      if (!chapters.has(entry.url)) chapters.set(entry.url, entry);
    }
    return [...chapters.values()];
  }

  async fetchChapter(session: SourceSession, ref: ChapterRef): Promise<ChapterHtml> {
    const page = await load(session, ref.url);
    const root = html.parse(page.text);
    const content = root.querySelector(sel.CHAPTER_CONTENT);
    if (!content)
      throw new StructureChanged(`no chapter text (${sel.CHAPTER_CONTENT}) at ${ref.url}`);
    html.strip(content, sel.CHAPTER_JUNK);
    return {
      url: page.url,
      html: content.outerHTML,
      title: html.text(root.querySelector(sel.CHAPTER_TITLE)) || null,
    };
  }

  private novelId(url: string): string {
    const parts = parseHttpUrl(url);
    if (this.hosts.has(parts.hostname)) {
      for (const pattern of NOVEL_ID_PATTERNS) {
        const match = pattern.exec(parts.pathname);
        if (match) return match[1]!;
      }
    }
    throw new UnsupportedUrl(
      `not a Ranobes novel URL: ${JSON.stringify(url)}`,
      "That Ranobes address isn't a novel page. Open the novel on Ranobes and copy the " +
        'address of its main page (…/novels/<number>-….html) or of any chapter.',
    );
  }

  /** An index page's data. Page 1 serves both the metadata step and the chapter list. */
  private async indexPage(session: SourceSession, url: string): Promise<IndexData> {
    const page = await load(session, url, true);
    if (!sel.INDEX_DATA_MARKER.test(page.text)) {
      throw new StructureChanged(`no chapter index data (window.__DATA__) at ${url}`);
    }
    const data = html.embeddedJson(page.text, sel.INDEX_DATA_MARKER) as
      Record<string, unknown> | undefined;
    if (typeof data !== 'object' || data === null || !Array.isArray(data.chapters)) {
      throw new StructureChanged(`window.__DATA__ has no chapter list at ${url}`);
    }
    return data as IndexData;
  }
}

/** A page as the web view shows it, once it's past the bot check. */
function load(session: SourceSession, url: string, reuse = false) {
  return session.render(url, { waitFor: sel.PAGE_LOADED, reuse, webViewAgent: true });
}

function indexEntries(data: IndexData, novelUrl: string): ChapterRef[] {
  return data.chapters.map((entry) => {
    const item = entry as Record<string, unknown> | null;
    const link = typeof item?.link === 'string' ? resolveUrl(item.link, ORIGIN) : null;
    const title = html.clean(item?.title);
    if (!item || !link || !title) {
      throw new StructureChanged(
        `unexpected chapter entry for ${novelUrl}: ${JSON.stringify(entry)}`,
      );
    }
    // Index dates look like "2026-09-23 20:16:21", without a zone: taken as UTC.
    return { url: onOrigin(link), title, publishedAt: html.parseIsoDate(item.date) };
  });
}

/** Links on a mirror (ranobes.top) point at the same pages on ranobes.net. */
function onOrigin(url: string): string {
  const parts = new URL(url);
  return `${ORIGIN}${parts.pathname}${parts.search}`;
}

/** The first JSON-LD object that names the novel, or {}. */
function novelJsonLd(root: html.HTMLElement): Record<string, unknown> {
  for (const script of root.querySelectorAll(sel.LD_JSON)) {
    let data: unknown;
    try {
      data = JSON.parse(script.textContent);
    } catch {
      continue;
    }
    for (const item of Array.isArray(data) ? (data as unknown[]) : [data]) {
      if (typeof item === 'object' && item !== null && (item as Record<string, unknown>).name) {
        return item as Record<string, unknown>;
      }
    }
  }
  return {};
}

/** The node's own text, without children such as the original-language subtitle. */
function ownText(node: html.HTMLElement | null): string {
  if (!node) return '';
  return html.collapse(
    node.childNodes
      .filter((child) => child.nodeType === html.NodeType.TEXT_NODE)
      .map((child) => child.text)
      .join(''),
  );
}
