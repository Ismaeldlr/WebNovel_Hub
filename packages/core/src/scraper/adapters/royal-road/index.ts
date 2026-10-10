// Royal Road: server-rendered HTML. The fiction page holds the metadata and the whole
// chapter list (as JSON in `window.chapters`, with the table of contents as a fallback).
// Chapter pages hide anti-piracy lines through a page-level CSS rule; they are removed.
//
// Canonical URLs are https://www.royalroad.com/fiction/<id>: the slug after the id
// changes when an author renames a fiction. Royal Road redirects to the current slug.
import { StructureChanged, UnsupportedUrl } from '../../errors.js';
import type { SourceSession } from '../../session.js';
import { parseHttpUrl, resolveUrl } from '../../urls.js';
import { Adapter, type ChapterHtml, type ChapterRef, type NovelMeta } from '../base.js';
import {
  type HTMLElement,
  attribute,
  collapse,
  description,
  embeddedJson,
  parse,
  parseIsoDate,
  text,
  texts,
} from '../html.js';
import * as sel from './selectors.js';

const ORIGIN = 'https://www.royalroad.com';
const FICTION_PATH = /^\/fiction\/(\d+)(?:\/|$)/;
/** …/chapter/<chapter id>/<slug>: the slug changes when the title does, the id doesn't. */
const CHAPTER_ID = /\/chapter\/(\d+)(?:\/|$)/;

/** Royal Road's dates carry their time zone (UTC); one without isn't trusted. */
const zonedDate = (value: unknown) => parseIsoDate(value, true);

export class RoyalRoadAdapter extends Adapter {
  readonly source = 'royal_road';
  readonly name = 'Royal Road';
  readonly homeUrl = ORIGIN;
  readonly hosts = new Set(['royalroad.com', 'www.royalroad.com']);

  canonicalize(url: string): string {
    const parts = parseHttpUrl(url);
    const match = FICTION_PATH.exec(parts.pathname);
    if (!this.hosts.has(parts.hostname) || !match) {
      throw new UnsupportedUrl(
        `not a Royal Road fiction URL: ${JSON.stringify(url)}`,
        "That Royal Road address isn't a fiction page. Open the novel on Royal Road and " +
          'copy the address of its main page (…/fiction/<number>/…).',
      );
    }
    return `${ORIGIN}/fiction/${match[1]}`;
  }

  override chapterKey(url: string): string {
    const match = CHAPTER_ID.exec(parseHttpUrl(url).pathname);
    return match ? `chapter/${match[1]}` : url;
  }

  async fetchNovel(session: SourceSession, url: string): Promise<NovelMeta> {
    const page = await session.get(url, { reuse: true });
    const root = parse(page.text);

    const title = text(root.querySelector(sel.TITLE));
    if (!title) throw new StructureChanged(`no fiction title (${sel.TITLE}) at ${url}`);
    const author =
      text(root.querySelector(sel.AUTHOR)) ||
      attribute(root.querySelector(sel.AUTHOR_META), 'content');
    let cover =
      attribute(root.querySelector(sel.COVER), 'src') ??
      attribute(root.querySelector(sel.COVER_META), 'content');
    if (cover?.includes(sel.NO_COVER_MARKER)) cover = null;
    return {
      title,
      author: author || null,
      description: description(
        root.querySelector(sel.DESCRIPTION) ?? root.querySelector(sel.DESCRIPTION_FALLBACK),
      ),
      tags: texts(root.querySelectorAll(sel.TAGS)),
      coverUrl: cover ? resolveUrl(cover, page.url) : null,
    };
  }

  async fetchChapterList(session: SourceSession, url: string): Promise<ChapterRef[]> {
    const page = await session.get(url, { reuse: true });
    const chapters =
      chaptersFromScript(page.text, page.url) ?? chaptersFromTable(parse(page.text), page.url);
    if (!chapters) {
      throw new StructureChanged(
        `no chapter list (window.chapters or ${sel.CHAPTER_ROWS}) at ${url}`,
      );
    }
    return chapters;
  }

  async fetchChapter(session: SourceSession, ref: ChapterRef): Promise<ChapterHtml> {
    const page = await session.get(ref.url);
    const root = parse(page.text);
    const content = root.querySelector(sel.CHAPTER_CONTENT);
    if (!content) {
      throw new StructureChanged(`no chapter text (${sel.CHAPTER_CONTENT}) at ${ref.url}`);
    }
    removeHiddenLines(root, content);
    return {
      url: page.url,
      html: content.outerHTML,
      title: text(root.querySelector(sel.CHAPTER_TITLE)) || null,
    };
  }
}

/** Chapters from `window.chapters`; null when the script isn't there. */
function chaptersFromScript(html: string, baseUrl: string): ChapterRef[] | null {
  if (!sel.CHAPTERS_SCRIPT_MARKER.test(html)) return null;
  const entries = embeddedJson(html, sel.CHAPTERS_SCRIPT_MARKER);
  if (entries === undefined) {
    throw new StructureChanged(`window.chapters is not valid JSON at ${baseUrl}`);
  }
  if (!Array.isArray(entries)) {
    throw new StructureChanged(`window.chapters is not a list at ${baseUrl}`);
  }

  const listed: { order: number; ref: ChapterRef }[] = [];
  entries.forEach((entry: unknown, position) => {
    const item = entry as Record<string, unknown> | null;
    const href = typeof item?.url === 'string' ? resolveUrl(item.url, baseUrl) : null;
    const title =
      typeof item?.title === 'string' || typeof item?.title === 'number'
        ? collapse(String(item.title))
        : '';
    if (!item || !href || !title) {
      throw new StructureChanged(
        `unexpected window.chapters entry at ${baseUrl}: ${JSON.stringify(entry)}`,
      );
    }
    // Hidden (draft) chapters and ones only patrons can open aren't readable.
    if (item.visible === 0 || item.visible === false || item.isUnlocked === false) return;
    listed.push({
      order: Number.isInteger(item.order) ? (item.order as number) : position,
      ref: { url: href, title, publishedAt: zonedDate(item.date) },
    });
  });
  return listed.sort((a, b) => a.order - b.order).map((item) => item.ref);
}

/** Chapters from the table of contents; null when there is no such table. */
function chaptersFromTable(root: HTMLElement, baseUrl: string): ChapterRef[] | null {
  if (!root.querySelector(sel.CHAPTER_TABLE)) return null;
  return root.querySelectorAll(sel.CHAPTER_ROWS).map((row) => {
    const link = row.querySelector(sel.CHAPTER_ROW_LINK);
    const href = attribute(link, 'href') ?? attribute(row, 'data-url');
    const title = text(link);
    const absolute = href ? resolveUrl(href, baseUrl) : null;
    if (!absolute || !title) {
      throw new StructureChanged(`chapter row without link or title at ${baseUrl}`);
    }
    return {
      url: absolute,
      title,
      publishedAt: zonedDate(attribute(row.querySelector(sel.CHAPTER_ROW_TIME), 'datetime')),
    };
  });
}

/** Removes the elements the page's CSS hides (the anti-piracy lines). */
function removeHiddenLines(root: HTMLElement, content: HTMLElement): void {
  const hidden = new Set<string>();
  for (const style of root.querySelectorAll('style')) {
    for (const match of style.textContent.matchAll(sel.HIDDEN_CLASS_RULE)) hidden.add(match[1]!);
  }
  for (const name of hidden) {
    for (const node of content.querySelectorAll(`[class~="${name}"]`)) node.remove();
  }
}
