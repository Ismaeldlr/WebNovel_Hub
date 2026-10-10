// The Readwn-style sites: WuxiaBox, FanMTL and WuxiaSpot, one template on three domains,
// each with its own catalog. Server-rendered pages: the novel page holds the metadata,
// and the chapter index comes 100 chapters a page, oldest first, read until a page
// brings nothing new. Canonical URLs are https://www.<site>/novel/<slug>.html.
import { StructureChanged, UnsupportedUrl } from '../../errors.js';
import type { SourceSession } from '../../session.js';
import { parseHttpUrl, resolveUrl } from '../../urls.js';
import { Adapter, type ChapterHtml, type ChapterRef, type NovelMeta } from '../base.js';
import * as html from '../html.js';
import * as sel from './selectors.js';

/** A limit on index pages (100 chapters each), in case a site never stops answering. */
const MAX_INDEX_PAGES = 500;

abstract class ReadwnAdapter extends Adapter {
  canonicalize(url: string): string {
    return `${this.homeUrl}/novel/${this.slug(url)}.html`;
  }

  async fetchNovel(session: SourceSession, url: string): Promise<NovelMeta> {
    const page = await session.get(this.canonicalize(url), { reuse: true });
    const root = html.parse(page.text);
    const title = html.firstText(root, sel.TITLE);
    if (!title) throw new StructureChanged(`no novel title (${sel.TITLE}) at ${url}`);
    return {
      title,
      author: html.firstText(root, sel.AUTHOR) || null,
      description:
        html.description(root.querySelector(sel.DESCRIPTION)) ??
        html.clean(html.meta(root, 'description')),
      tags: html.texts(root.querySelectorAll(sel.GENRES)),
      coverUrl: html.imageUrl(root.querySelector(sel.COVER), page.url),
    };
  }

  async fetchChapterList(session: SourceSession, url: string): Promise<ChapterRef[]> {
    const slug = this.slug(url);
    const chapters = new Map<string, ChapterRef>();
    for (let page = 0; page < MAX_INDEX_PAGES; page += 1) {
      const index = sel.indexUrl(this.homeUrl, page, slug);
      const links = html.parse((await session.get(index)).text).querySelectorAll(sel.CHAPTER_LINKS);
      const before = chapters.size;
      for (const link of links) {
        const href = link.getAttribute('href');
        const title = html.firstText(link, sel.CHAPTER_TITLE_IN_LINK);
        const chapterUrl = href ? resolveUrl(href, this.homeUrl) : null;
        if (!chapterUrl || !title) {
          throw new StructureChanged(`unexpected chapter link at ${index}: ${link.outerHTML}`);
        }
        if (!chapters.has(chapterUrl))
          chapters.set(chapterUrl, { url: chapterUrl, title, publishedAt: null });
      }
      if (chapters.size === before) break;
    }
    if (chapters.size === 0)
      throw new StructureChanged(`no chapters (${sel.CHAPTER_LINKS}) for ${url}`);
    return [...chapters.values()];
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
      `not a ${this.name} novel URL: ${JSON.stringify(url)}`,
      `That ${this.name} address isn't a novel page. Open the novel on ${this.name} and copy ` +
        'the address of its page (…/novel/<name>.html) or of any chapter.',
    );
  }
}

export class WuxiaBoxAdapter extends ReadwnAdapter {
  readonly source = 'wuxia_box';
  readonly name = 'WuxiaBox';
  readonly homeUrl = 'https://www.wuxiabox.com';
  readonly hosts = new Set(['wuxiabox.com', 'www.wuxiabox.com']);
}

export class FanMtlAdapter extends ReadwnAdapter {
  readonly source = 'fan_mtl';
  readonly name = 'FanMTL';
  readonly homeUrl = 'https://www.fanmtl.com';
  readonly hosts = new Set(['fanmtl.com', 'www.fanmtl.com', 'fansmtl.com', 'www.fansmtl.com']);
}

export class WuxiaSpotAdapter extends ReadwnAdapter {
  readonly source = 'wuxia_spot';
  readonly name = 'WuxiaSpot';
  readonly homeUrl = 'https://www.wuxiaspot.com';
  readonly hosts = new Set(['wuxiaspot.com', 'www.wuxiaspot.com']);
}
