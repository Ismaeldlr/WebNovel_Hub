// LNMTL: machine-translated Chinese novels. The novel page holds the metadata and its
// volumes (as JSON in a script); each volume's chapters come from the site's JSON
// endpoint, 50 a page. A chapter page shows each translated sentence beside the original;
// the translation is kept, one paragraph a sentence.
//
// Canonical URLs are https://lnmtl.com/novel/<slug>. Chapter addresses don't name their
// novel, so only novel pages can be imported.
import { StructureChanged, UnsupportedUrl } from '../../errors.js';
import type { SourceSession } from '../../session.js';
import { parseHttpUrl } from '../../urls.js';
import { Adapter, type ChapterHtml, type ChapterRef, type NovelMeta } from '../base.js';
import * as html from '../html.js';
import * as sel from './selectors.js';

/** A limit on pages per volume (50 chapters each). */
const MAX_VOLUME_PAGES = 200;

type Entry = Record<string, unknown>;

const numberOf = (item: unknown, key: string) => {
  const value = typeof item === 'object' && item !== null ? (item as Entry)[key] : undefined;
  return Number.isInteger(value) ? (value as number) : 0;
};

export class LnmtlAdapter extends Adapter {
  readonly source = 'lnmtl';
  readonly name = 'LNMTL';
  readonly homeUrl = sel.ORIGIN;
  readonly hosts = new Set(['lnmtl.com', 'www.lnmtl.com']);

  canonicalize(url: string): string {
    const parts = parseHttpUrl(url);
    const slug = this.hosts.has(parts.hostname)
      ? sel.NOVEL_PATH.exec(parts.pathname)?.groups?.slug
      : undefined;
    if (slug) return `${sel.ORIGIN}/novel/${slug}`;
    throw new UnsupportedUrl(
      `not an LNMTL novel URL: ${JSON.stringify(url)}`,
      "That LNMTL address isn't a novel page. Open the novel on LNMTL and copy the address of " +
        "its page (…/novel/<name>); chapter addresses don't say which novel they belong to.",
    );
  }

  async fetchNovel(session: SourceSession, url: string): Promise<NovelMeta> {
    const page = await session.get(this.canonicalize(url), { reuse: true });
    const root = html.parse(page.text);
    const title = html.clean(html.meta(root, sel.TITLE_META)) || html.firstText(root, sel.TITLE);
    if (!title) throw new StructureChanged(`no novel title (${sel.TITLE}) at ${url}`);
    let author: string | null = null;
    for (const details of root.querySelectorAll(sel.DETAILS)) {
      if (html.firstText(details, 'dt') === sel.AUTHORS_LABEL)
        author = html.firstText(details, 'dd') || null;
    }
    return {
      title,
      author,
      description: html.description(root.querySelector(sel.DESCRIPTION)),
      tags: [],
      coverUrl: html.imageUrl(root.querySelector(sel.COVER), page.url),
    };
  }

  async fetchChapterList(session: SourceSession, url: string): Promise<ChapterRef[]> {
    const page = await session.get(this.canonicalize(url), { reuse: true });
    const volumes = html.embeddedJson(page.text, sel.VOLUMES_MARKER);
    if (!Array.isArray(volumes) || volumes.length === 0) {
      throw new StructureChanged(`no volumes (lnmtl.volumes) at ${url}`);
    }
    const chapters = new Map<string, ChapterRef>();
    for (const volume of [...(volumes as unknown[])].sort(
      (a, b) => numberOf(a, 'number') - numberOf(b, 'number'),
    )) {
      if (typeof volume !== 'object' || volume === null || !('id' in volume)) {
        throw new StructureChanged(`unexpected volume for ${url}: ${JSON.stringify(volume)}`);
      }
      const id = (volume as Entry).id;
      let last = 1;
      for (let number = 1; number <= Math.min(last, MAX_VOLUME_PAGES); number += 1) {
        const data = (await session.getJson(sel.volumeChaptersApi(number, id))) as Entry | null;
        if (typeof data !== 'object' || data === null || !Array.isArray(data.data)) {
          throw new StructureChanged(`no chapters for volume ${String(id)} of ${url}`);
        }
        last = Number.isInteger(data.last_page) ? (data.last_page as number) : 1;
        const entries = [...(data.data as unknown[])].sort(
          (a, b) => numberOf(a, 'position') - numberOf(b, 'position'),
        );
        for (const entry of entries) {
          const ref = toChapter(entry, url);
          if (!chapters.has(ref.url)) chapters.set(ref.url, ref);
        }
      }
    }
    return [...chapters.values()];
  }

  async fetchChapter(session: SourceSession, ref: ChapterRef): Promise<ChapterHtml> {
    const page = await session.get(ref.url);
    const root = html.parse(page.text);
    const body = root.querySelector(sel.CHAPTER_BODY);
    if (!body) throw new StructureChanged(`no chapter text (${sel.CHAPTER_BODY}) at ${ref.url}`);
    const content = body
      .querySelectorAll(sel.SENTENCES)
      .map(html.text)
      .filter(Boolean)
      .map((sentence) => `<p>${html.escapeHtml(sentence)}</p>`)
      .join('');
    if (!content)
      throw new StructureChanged(`no translated sentences (${sel.SENTENCES}) at ${ref.url}`);
    return { url: page.url, html: content, title: html.firstText(root, sel.CHAPTER_TITLE) || null };
  }
}

function toChapter(entry: unknown, novelUrl: string): ChapterRef {
  const item = typeof entry === 'object' && entry !== null ? (entry as Entry) : null;
  const title = html.clean(item?.title);
  if (!item || typeof item.slug !== 'string' || !item.slug || !title) {
    throw new StructureChanged(
      `unexpected chapter entry for ${novelUrl}: ${JSON.stringify(entry)}`,
    );
  }
  return {
    url: sel.chapterUrl(item.slug),
    title,
    publishedAt: html.parseDate(item.created_at, sel.DATE_FORMAT),
  };
}
