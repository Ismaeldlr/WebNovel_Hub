// ReadNovel.eu (also wuxiaworld.eu and wuxia.click, the same catalog): a Next.js site whose
// pages carry their data as JSON. The novel page gives the metadata and the chapter list,
// 100 chapters a page; each chapter page gives its text as plain paragraphs. Canonical
// URLs are https://readnovel.eu/novel/<slug>.
import { htmlToText, plainTextToParagraphs } from '../../../epub/normalize.js';
import { StructureChanged, UnsupportedUrl } from '../../errors.js';
import type { SourceSession } from '../../session.js';
import { parseHttpUrl } from '../../urls.js';
import { Adapter, type ChapterHtml, type ChapterRef, type NovelMeta } from '../base.js';
import * as html from '../html.js';
import * as sel from './selectors.js';

/** A limit on chapter-list pages (100 chapters each). */
const MAX_LIST_PAGES = 200;

type Entry = Record<string, unknown>;

const isEntry = (value: unknown): value is Entry =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const entries = (value: unknown): Entry[] =>
  Array.isArray(value) ? (value as unknown[]).filter(isEntry) : [];

/** The description, which the site keeps as plain text (older novels: HTML). */
function description(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return (/<[a-z][^>]*>/i.test(value) ? htmlToText(value) : plainTextToParagraphs(value)) || null;
}

export class ReadNovelEuAdapter extends Adapter {
  readonly source = 'readnovel_eu';
  readonly name = 'ReadNovel.eu';
  readonly homeUrl = sel.ORIGIN;
  readonly hosts = new Set([
    'readnovel.eu',
    'www.readnovel.eu',
    'wuxiaworld.eu',
    'www.wuxiaworld.eu',
    'wuxia.click',
    'www.wuxia.click',
  ]);

  canonicalize(url: string): string {
    return sel.novelPage(this.slug(url));
  }

  async fetchNovel(session: SourceSession, url: string): Promise<NovelMeta> {
    const { novel } = await this.novelPage(session, url, 1);
    const title = html.clean(novel.title);
    if (!title) throw new StructureChanged(`no novel title in the page data at ${url}`);
    const coverKey = html.clean(novel.coverKey);
    const original = html.clean(novel.coverOriginal);
    return {
      title,
      author: isEntry(novel.author) ? html.clean(novel.author.name) : null,
      description: description(novel.description),
      // Its genres; "tags" are dozens of NovelUpdates-style tropes per novel.
      tags: [...new Set(entries(novel.genres).flatMap((genre) => html.clean(genre.name) ?? []))],
      coverUrl: coverKey
        ? sel.coverUrl(coverKey)
        : original
          ? sel.originalCoverUrl(original)
          : null,
    };
  }

  async fetchChapterList(session: SourceSession, url: string): Promise<ChapterRef[]> {
    const slug = this.slug(url);
    const first = await this.novelPage(session, url, 1);
    const pages = Math.min(
      MAX_LIST_PAGES,
      Math.max(1, ...entries(first.toc.ranges).map((range) => Number(range.page) || 1)),
    );
    const items = entries(first.toc.items);
    for (let page = 2; page <= pages; page += 1) {
      items.push(...entries((await this.novelPage(session, url, page)).toc.items));
    }
    if (items.length === 0) throw new StructureChanged(`no chapters in the page data at ${url}`);

    const chapters = new Map<number, ChapterRef>();
    for (const item of items) {
      const number = Number(item.number);
      const title = html.clean(item.title);
      if (!Number.isInteger(number) || number < 1 || !title) {
        throw new StructureChanged(`unexpected chapter entry for ${url}: ${JSON.stringify(item)}`);
      }
      chapters.set(number, {
        url: sel.chapterUrl(slug, number),
        title,
        publishedAt: html.parseIsoDate(item.createdAt, true),
      });
    }
    return [...chapters].sort(([a], [b]) => a - b).map(([, chapter]) => chapter);
  }

  async fetchChapter(session: SourceSession, ref: ChapterRef): Promise<ChapterHtml> {
    const page = await session.get(ref.url);
    const data = pageData(page.text, ref.url).data;
    const chapter = isEntry(data) ? data.chapter : null;
    const paragraphs =
      isEntry(chapter) && Array.isArray(chapter.paragraphs) ? chapter.paragraphs : [];
    const text = (paragraphs as unknown[]).filter((line) => typeof line === 'string').join('\n');
    if (!isEntry(chapter) || !text.trim()) {
      throw new StructureChanged(`no chapter text in the page data at ${ref.url}`);
    }
    return { url: page.url, html: html.paragraphs(text), title: html.clean(chapter.title) };
  }

  private async novelPage(session: SourceSession, url: string, number: number) {
    const address = sel.novelPage(this.slug(url), number);
    const props = pageData((await session.get(address, { reuse: true })).text, address);
    if (!isEntry(props.novel) || !isEntry(props.toc)) {
      throw new StructureChanged(`no novel in the page data at ${address}`);
    }
    return { novel: props.novel, toc: props.toc };
  }

  private slug(url: string): string {
    const parts = parseHttpUrl(url);
    if (this.hosts.has(parts.hostname)) {
      for (const pattern of [sel.NOVEL_PATH, sel.CHAPTER_PATH]) {
        const slug = pattern.exec(parts.pathname)?.groups?.slug;
        if (slug) return slug;
      }
    }
    throw new UnsupportedUrl(
      `not a ReadNovel.eu novel URL: ${JSON.stringify(url)}`,
      "That address isn't a novel page. Open the novel on ReadNovel.eu and copy the address " +
        'of its page (…/novel/<name>) or of any chapter.',
    );
  }
}

/** A page's `props.pageProps`. */
function pageData(page: string, url: string): Entry {
  const script = html.parse(page).querySelector(sel.NEXT_DATA);
  let props: unknown;
  try {
    props = (JSON.parse(script?.textContent ?? '') as { props?: { pageProps?: unknown } }).props
      ?.pageProps;
  } catch {
    props = undefined;
  }
  if (!isEntry(props))
    throw new StructureChanged(`no Next.js page data (${sel.NEXT_DATA}) at ${url}`);
  return props;
}
