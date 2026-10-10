// Novel Fire: server-rendered pages. The novel page holds the metadata; the chapter index
// is a separate page, 100 chapters a page, oldest first, read up to the last page its
// pagination names. Canonical URLs are https://novelfire.net/book/<slug>: the slug is
// the site's only identifier.
import { StructureChanged, UnsupportedUrl } from '../../errors.js';
import type { SourceSession } from '../../session.js';
import { parseHttpUrl, resolveUrl } from '../../urls.js';
import { Adapter, type ChapterHtml, type ChapterRef, type NovelMeta } from '../base.js';
import * as html from '../html.js';
import * as sel from './selectors.js';

/** A limit on index pages (100 chapters each). */
const MAX_INDEX_PAGES = 500;

export class NovelFireAdapter extends Adapter {
  readonly source = 'novel_fire';
  readonly name = 'Novel Fire';
  readonly homeUrl = sel.ORIGIN;
  readonly hosts = new Set(['novelfire.net', 'www.novelfire.net']);

  canonicalize(url: string): string {
    return `${sel.ORIGIN}/book/${this.slug(url)}`;
  }

  async fetchNovel(session: SourceSession, url: string): Promise<NovelMeta> {
    const page = await session.get(this.canonicalize(url), { reuse: true });
    const root = html.parse(page.text);
    const title = html.firstText(root, sel.TITLE) || html.clean(html.meta(root, 'og:title'));
    if (!title) throw new StructureChanged(`no novel title (${sel.TITLE}) at ${url}`);
    const cover =
      html.imageUrl(root.querySelector(sel.COVER), page.url) ?? html.meta(root, 'og:image');
    return {
      title,
      author: html.firstText(root, sel.AUTHOR) || null,
      description:
        html.description(root.querySelector(sel.DESCRIPTION), sel.DESCRIPTION_JUNK) ??
        html.clean(html.meta(root, 'description')),
      tags: html.texts(root.querySelectorAll(sel.GENRES)),
      coverUrl: cover ? resolveUrl(cover, page.url) : null,
    };
  }

  async fetchChapterList(session: SourceSession, url: string): Promise<ChapterRef[]> {
    const index = `${this.canonicalize(url)}/chapters`;
    const first = html.parse((await session.get(index)).text);
    const last = Math.max(
      1,
      ...first
        .querySelectorAll(sel.PAGE_LINKS)
        .map((link) => Number(sel.PAGE_NUMBER.exec(link.getAttribute('href') ?? '')?.[1] ?? 1)),
    );
    const chapters = indexEntries(first, url);
    for (let number = 2; number <= Math.min(last, MAX_INDEX_PAGES); number += 1) {
      chapters.push(
        ...indexEntries(html.parse((await session.get(`${index}?page=${number}`)).text), url),
      );
    }
    if (chapters.length === 0)
      throw new StructureChanged(`no chapters (${sel.CHAPTER_LINKS}) at ${index}`);
    // A chapter the site re-sorted between two pages appears twice: once is enough.
    return [...new Map(chapters.map((chapter) => [chapter.url, chapter])).values()];
  }

  async fetchChapter(session: SourceSession, ref: ChapterRef): Promise<ChapterHtml> {
    const page = await session.get(ref.url);
    const root = html.parse(page.text);
    const content = root.querySelector(sel.CHAPTER_CONTENT);
    if (!content)
      throw new StructureChanged(`no chapter text (${sel.CHAPTER_CONTENT}) at ${ref.url}`);
    html.strip(content, sel.CHAPTER_JUNK);
    return {
      url: page.url,
      html: content.outerHTML,
      title: html.firstText(root, sel.CHAPTER_TITLE) || null,
    };
  }

  private slug(url: string): string {
    const parts = parseHttpUrl(url);
    const slug = this.hosts.has(parts.hostname)
      ? sel.NOVEL_PATH.exec(parts.pathname)?.groups?.slug
      : undefined;
    if (slug) return slug;
    throw new UnsupportedUrl(
      `not a Novel Fire novel URL: ${JSON.stringify(url)}`,
      "That Novel Fire address isn't a novel page. Open the novel on Novel Fire and copy the " +
        'address of its page (…/book/<name>) or of any chapter.',
    );
  }
}

function indexEntries(root: html.HTMLElement, novelUrl: string): ChapterRef[] {
  return root.querySelectorAll(sel.CHAPTER_LINKS).map((link) => {
    const href = link.getAttribute('href');
    const title =
      html.firstText(link, sel.CHAPTER_TITLE_IN_LINK) || html.clean(link.getAttribute('title'));
    const chapterUrl = href ? resolveUrl(href, sel.ORIGIN) : null;
    if (!chapterUrl || !title) {
      throw new StructureChanged(`unexpected chapter link for ${novelUrl}: ${link.outerHTML}`);
    }
    const date = html.attribute(link.querySelector(sel.CHAPTER_DATE_IN_LINK), 'datetime');
    return { url: chapterUrl, title, publishedAt: html.parseDate(date, sel.CHAPTER_DATE_FORMAT) };
  });
}
