// Wuxiaworld: novel and chapter pages are rendered on the server with their data as JSON
// (`window.__REACT_QUERY_STATE__`). The chapter list comes from the site's own gRPC-web
// API, the call its pages make.
//
// Most chapters of most novels are sold (Karma, VIP) or are a sponsor's advance chapters;
// only the free ones are listed, since the app doesn't get around paywalls. A chapter
// that is no longer free answers with a teaser and is reported as locked. Canonical URLs
// are https://www.wuxiaworld.com/novel/<slug>.
import { PermanentError, StructureChanged, UnsupportedUrl } from '../../errors.js';
import type { SourceSession } from '../../session.js';
import { parseHttpUrl } from '../../urls.js';
import { Adapter, type ChapterHtml, type ChapterRef, type NovelMeta } from '../base.js';
import * as html from '../html.js';
import * as pb from './protobuf.js';
import * as sel from './selectors.js';

type Entry = Record<string, unknown>;

const isEntry = (value: unknown): value is Entry =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Optional fields come wrapped as {"value": …}. */
const unwrap = (wrapper: unknown): unknown => (isEntry(wrapper) ? wrapper.value : wrapper);

export class WuxiaworldAdapter extends Adapter {
  readonly source = 'wuxiaworld';
  readonly name = 'Wuxiaworld';
  readonly homeUrl = sel.ORIGIN;
  readonly hosts = new Set(['wuxiaworld.com', 'www.wuxiaworld.com', 'm.wuxiaworld.com']);

  canonicalize(url: string): string {
    return `${sel.ORIGIN}/novel/${this.slug(url)}`;
  }

  async fetchNovel(session: SourceSession, url: string): Promise<NovelMeta> {
    const item = await this.novel(session, url);
    const title = html.clean(item.name);
    if (!title) throw new StructureChanged(`no novel name in the page data at ${url}`);
    const genres = Array.isArray(item.genres) ? (item.genres as unknown[]) : [];
    return {
      title,
      author: html.clean(unwrap(item.authorName)),
      description:
        html.htmlDescription(unwrap(item.synopsis)) ??
        html.htmlDescription(unwrap(item.description)),
      tags: [...new Set(genres.filter((genre): genre is string => typeof genre === 'string'))],
      coverUrl: html.clean(unwrap(item.coverUrl)),
    };
  }

  async fetchChapterList(session: SourceSession, url: string): Promise<ChapterRef[]> {
    const novelId = Number((await this.novel(session, url)).id);
    if (!Number.isInteger(novelId))
      throw new StructureChanged(`no novel id in the page data at ${url}`);
    const body = await session.postBytes(
      sel.CHAPTER_LIST_URL,
      pb.grpcWebFrame(pb.intField(1, novelId)),
      sel.GRPC_HEADERS,
    );
    const groups = pb.messages(pb.decode(pb.grpcWebMessage(body)), 1);
    if (groups.length === 0)
      throw new StructureChanged(`no chapter groups from the API for ${url}`);
    const canonical = this.canonicalize(url);
    const chapters: ChapterRef[] = [];
    groups.sort((a, b) => pb.firstInt(a, sel.GROUP_ORDER) - pb.firstInt(b, sel.GROUP_ORDER));
    for (const group of groups) {
      for (const chapter of pb.messages(group, sel.GROUP_CHAPTERS)) {
        const pricing = pb.decode(pb.firstBytes(chapter, sel.CHAPTER_PRICING));
        if (
          !pb.firstInt(chapter, sel.CHAPTER_VISIBLE) ||
          !pb.firstInt(pricing, sel.PRICING_IS_FREE)
        )
          continue;
        const slug = pb.firstText(chapter, sel.CHAPTER_SLUG);
        const title = html.collapse(pb.firstText(chapter, sel.CHAPTER_NAME));
        if (!slug || !title)
          throw new StructureChanged(`a chapter without slug or name for ${url}`);
        const published = pb.decode(pb.firstBytes(chapter, sel.CHAPTER_PUBLISHED_AT));
        const seconds = pb.firstInt(published, sel.TIMESTAMP_SECONDS);
        chapters.push({
          url: `${canonical}/${slug}`,
          title,
          publishedAt: seconds ? new Date(seconds * 1000) : null,
        });
      }
    }
    return chapters;
  }

  async fetchChapter(session: SourceSession, ref: ChapterRef): Promise<ChapterHtml> {
    const page = await session.get(ref.url);
    const data = query(page.text, sel.CHAPTER_QUERY);
    const item = isEntry(data) ? data.item : null;
    if (!isEntry(item)) throw new StructureChanged(`no chapter in the page data at ${ref.url}`);
    const content = unwrap(item.content);
    if (item.isTeaser || typeof content !== 'string' || !content.trim()) {
      throw new PermanentError(
        `chapter is locked: ${ref.url}`,
        'This chapter is no longer free on Wuxiaworld. Only the chapters anyone can read ' +
          'without paying can be fetched.',
      );
    }
    return { url: page.url, html: content, title: html.clean(item.name) };
  }

  private async novel(session: SourceSession, url: string): Promise<Entry> {
    const page = await session.get(this.canonicalize(url), { reuse: true });
    const data = query(page.text, sel.NOVEL_QUERY);
    const item = isEntry(data) ? data.item : null;
    if (!isEntry(item)) throw new StructureChanged(`no novel in the page data at ${url}`);
    return item;
  }

  private slug(url: string): string {
    const parts = parseHttpUrl(url);
    const slug = this.hosts.has(parts.hostname)
      ? sel.NOVEL_PATH.exec(parts.pathname)?.groups?.slug
      : undefined;
    if (slug) return slug;
    throw new UnsupportedUrl(
      `not a Wuxiaworld novel URL: ${JSON.stringify(url)}`,
      "That Wuxiaworld address isn't a novel page. Open the novel on Wuxiaworld and copy the " +
        'address of its page (…/novel/<name>) or of any chapter.',
    );
  }
}

/** The data of the page's first query of `kind` ("novel" or "chapter"). */
function query(page: string, kind: string): unknown {
  const state = html.embeddedJson(page, sel.STATE_MARKER);
  const queries =
    isEntry(state) && Array.isArray(state.queries) ? (state.queries as unknown[]) : [];
  for (const item of queries) {
    const key = isEntry(item) ? item.queryKey : null;
    if (Array.isArray(key) && key[0] === kind) {
      const itemState = (item as Entry).state;
      return isEntry(itemState) ? itemState.data : undefined;
    }
  }
  throw new StructureChanged(`no ${kind} data (__REACT_QUERY_STATE__) in the page`);
}
