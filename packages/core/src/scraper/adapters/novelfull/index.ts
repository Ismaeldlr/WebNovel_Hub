// The NovelFull-style sites: ReadNovelFull, Novgo (formerly AllNovelFull) and NovelPing.
// Server-rendered pages from one template: the novel page holds the metadata and the
// novel's id, and one endpoint returns the whole chapter list as an HTML fragment, oldest
// first. Canonical URLs are the novel page, which these sites address by slug only.
import { StructureChanged, UnsupportedUrl } from '../../errors.js';
import type { SourceSession } from '../../session.js';
import { parseHttpUrl, resolveUrl } from '../../urls.js';
import { Adapter, type ChapterHtml, type ChapterRef, type NovelMeta } from '../base.js';
import * as html from '../html.js';
import { type Layout, NOVELPING, NOVGO, READNOVELFULL } from './selectors.js';

abstract class NovelFullAdapter extends Adapter {
  protected abstract readonly layout: Layout;

  get homeUrl(): string {
    return this.layout.origin;
  }

  canonicalize(url: string): string {
    return this.layout.novelUrl(this.slug(url));
  }

  async fetchNovel(session: SourceSession, url: string): Promise<NovelMeta> {
    const { layout } = this;
    const page = await session.get(this.canonicalize(url), { reuse: true });
    const root = html.parse(page.text);
    const title = html.firstText(root, layout.title) || html.clean(html.meta(root, 'og:title'));
    if (!title) throw new StructureChanged(`no novel title (${layout.title}) at ${url}`);
    const cover =
      html.imageUrl(root.querySelector(layout.cover), page.url) ?? html.meta(root, 'og:image');
    return {
      title,
      author: html.firstText(root, layout.author) || null,
      description:
        html.description(root.querySelector(layout.description)) ??
        html.clean(html.meta(root, 'description')),
      tags: html.texts(root.querySelectorAll(layout.genres)),
      coverUrl: cover ? resolveUrl(cover, page.url) : null,
    };
  }

  async fetchChapterList(session: SourceSession, url: string): Promise<ChapterRef[]> {
    const { layout } = this;
    const canonical = this.canonicalize(url);
    let novelId = this.slug(url);
    if (layout.novelId !== null) {
      const page = await session.get(canonical, { reuse: true });
      novelId =
        html.attribute(html.parse(page.text).querySelector(layout.novelId), 'data-novel-id') ?? '';
      if (!novelId) throw new StructureChanged(`no novel id (${layout.novelId}) at ${url}`);
    }
    const endpoint = layout.chapterListUrl(novelId);
    const fragment = html.parse((await session.get(endpoint)).text);

    const chapters = new Map<string, ChapterRef>();
    for (const item of fragment.querySelectorAll(layout.chapterItems)) {
      const href = item.getAttribute(item.tagName === 'OPTION' ? 'value' : 'href');
      const title = html.text(item) || html.clean(item.getAttribute('title'));
      const chapterUrl = href ? withoutFragment(resolveUrl(href, layout.origin)) : null;
      if (!chapterUrl || !title) continue;
      // Only the novel's own chapters: the fragment can hold other links.
      if (
        chapterUrl !== canonical &&
        this.owns(chapterUrl, canonical) &&
        !chapters.has(chapterUrl)
      ) {
        chapters.set(chapterUrl, { url: chapterUrl, title, publishedAt: null });
      }
    }
    if (chapters.size === 0) {
      throw new StructureChanged(`no chapters (${layout.chapterItems}) at ${endpoint}`);
    }
    return [...chapters.values()];
  }

  async fetchChapter(session: SourceSession, ref: ChapterRef): Promise<ChapterHtml> {
    const { layout } = this;
    const page = await session.get(ref.url);
    const root = html.parse(page.text);
    const content = root.querySelector(layout.chapterContent);
    if (!content) {
      throw new StructureChanged(`no chapter text (${layout.chapterContent}) at ${ref.url}`);
    }
    html.strip(content, layout.chapterJunk);
    return {
      url: page.url,
      html: content.outerHTML,
      title: html.firstText(root, layout.chapterTitle) || null,
    };
  }

  private owns(chapterUrl: string, canonical: string): boolean {
    try {
      return this.canonicalize(chapterUrl) === canonical;
    } catch {
      return false;
    }
  }

  private slug(url: string): string {
    const parts = parseHttpUrl(url);
    const slug = this.hosts.has(parts.hostname)
      ? this.layout.novelPath.exec(parts.pathname)?.groups?.slug
      : undefined;
    if (slug) return slug;
    throw new UnsupportedUrl(
      `not a ${this.name} novel URL: ${JSON.stringify(url)}`,
      `That ${this.name} address isn't a novel page. Open the novel on ${this.name} and ` +
        'copy the address of its page or of any chapter.',
    );
  }
}

/** Without the fragment: comment counts link to "<chapter>#comments". */
function withoutFragment(url: string | null): string | null {
  if (url === null) return null;
  const parsed = new URL(url);
  parsed.hash = '';
  return parsed.href;
}

export class ReadNovelFullAdapter extends NovelFullAdapter {
  readonly source = 'read_novel_full';
  readonly name = 'ReadNovelFull';
  readonly hosts = new Set(['readnovelfull.com', 'www.readnovelfull.com']);
  protected readonly layout = READNOVELFULL;
}

export class NovgoAdapter extends NovelFullAdapter {
  readonly source = 'novgo';
  readonly name = 'Novgo';
  /** AllNovelFull moved here and redirects its old addresses. */
  readonly hosts = new Set([
    'novgo.net',
    'www.novgo.net',
    'allnovelfull.net',
    'www.allnovelfull.net',
  ]);
  protected readonly layout = NOVGO;
}

export class NovelPingAdapter extends NovelFullAdapter {
  readonly source = 'novel_ping';
  readonly name = 'NovelPing';
  readonly hosts = new Set(['novelping.com', 'www.novelping.com']);
  protected readonly layout = NOVELPING;
}
