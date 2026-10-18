// WTR Lab: a Next.js site, read three ways. The novel page's embedded data gives the
// metadata, the site's own JSON endpoint the whole chapter list, and chapter text needs a
// rendered page: the page loads and assembles it in its scripts (including its glossary of
// translated terms), so what is stored is what a reader sees.
//
// Guests get the AI translation for the first 10 chapters only. Past those, the app needs
// to be signed in (the reader signs in in a window of the app, whose cookies the rendered
// pages share), or the reader chose the site's machine translation for those chapters.
//
// After a lot of reading from one IP address, chapter pages show a security check instead
// of the text. It counts as a refusal: fetching backs off, then tries again.
//
// Canonical URLs are https://wtr-lab.com/en/novel/<id>/<slug>: the site needs the slug
// (/en/novel/<id> alone is a 404), and English is the reading language.
import { htmlToText } from '../../../epub/normalize.js';
import { SignInRequired, StructureChanged, UnsupportedUrl } from '../../errors.js';
import type { SourceSession } from '../../session.js';
import { parseHttpUrl } from '../../urls.js';
import {
  Adapter,
  type ChapterHtml,
  type ChapterRef,
  type NovelMeta,
  type SiteAccount,
} from '../base.js';
import * as html from '../html.js';
import * as sel from './selectors.js';

/** Chapters asked for per call when the list has to be fetched in ranges. */
const RANGE_SIZE = 500;

type Entry = Record<string, unknown>;

const isEntry = (value: unknown): value is Entry =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A whole number, or a string holding one; null otherwise. */
function toInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  return typeof value === 'string' && /^\s*[+-]?\d+\s*$/.test(value) ? Number(value) : null;
}

export class WtrLabAdapter extends Adapter {
  readonly source = 'wtr_lab';
  readonly name = 'WTR Lab';
  readonly homeUrl = sel.ORIGIN;
  readonly hosts = new Set(['wtr-lab.com', 'www.wtr-lab.com']);
  override readonly account: SiteAccount = {
    signInUrl: sel.SIGN_IN_URL,
    statusUrl: sel.ACCOUNT_STATUS_URL,
    signedIn: (page) =>
      page.includes('"Unauthorized"') ? false : page.includes('"config"') ? true : null,
  };

  canonicalize(url: string): string {
    const { id, slug } = this.parse(url);
    return `${sel.ORIGIN}/en/novel/${id}/${slug}`;
  }

  async fetchNovel(session: SourceSession, url: string): Promise<NovelMeta> {
    const data = (await this.serie(session, url)).data;
    if (!isEntry(data)) throw new StructureChanged(`no serie_data.data in the page data at ${url}`);
    const title = html.clean(data.title);
    if (!title) throw new StructureChanged(`no novel title in the page data at ${url}`);
    return {
      title,
      author: html.clean(data.author),
      description: plainDescription(data.description),
      // Genres and tags are numeric ids in the page data, without their names.
      tags: [],
      coverUrl: html.clean(data.image),
    };
  }

  async fetchChapterList(session: SourceSession, url: string): Promise<ChapterRef[]> {
    const { id } = this.parse(url);
    const novelUrl = this.canonicalize(url);
    const entries = chapterEntries(await session.getJson(sel.chapterListApi(id)), novelUrl);

    // The endpoint returns everything at once today; should it ever stop short of the
    // novel's chapter count, the rest is fetched in ranges.
    const expected = toInt((await this.serie(session, url)).chapter_count);
    while (expected && entries.size < expected) {
      const start = Math.max(0, ...entries.keys()) + 1;
      const more = chapterEntries(
        await session.getJson(sel.chapterRangeApi(id, start, start + RANGE_SIZE - 1)),
        novelUrl,
      );
      const added = [...more].filter(([order]) => !entries.has(order));
      if (added.length === 0) break;
      for (const [order, entry] of added) entries.set(order, entry);
    }

    return [...entries]
      .sort(([a], [b]) => a - b)
      .map(([order, entry]) => ({
        url: sel.chapterUrl(novelUrl, order),
        title: entry.title || `Chapter ${order}`,
        publishedAt: entry.publishedAt,
      }));
  }

  async fetchChapter(session: SourceSession, ref: ChapterRef): Promise<ChapterHtml> {
    const chapter = await renderChapter(session, ref.url);
    if (!chapter.locked) return chapter;
    if (!session.options.wtrLabMachineTranslation) {
      throw new SignInRequired(
        `${ref.url} shows its AI translation to signed-in readers only`,
        "WTR Lab shows this chapter's AI translation only to signed-in readers. Sign in to " +
          'WTR Lab in Settings, or choose its machine translation there.',
      );
    }
    const machine = await renderChapter(session, sel.machineTranslationUrl(ref.url));
    if (machine.locked) {
      throw new StructureChanged(`no machine translation either at ${ref.url}`);
    }
    return machine;
  }

  private parse(url: string): { id: string; slug: string } {
    const parts = parseHttpUrl(url);
    const groups = this.hosts.has(parts.hostname)
      ? sel.NOVEL_PATH.exec(parts.pathname)?.groups
      : undefined;
    const id = groups?.id ?? groups?.legacyId;
    if (groups?.slug && id) return { id, slug: groups.slug.toLowerCase() };
    throw new UnsupportedUrl(
      `not a WTR Lab novel URL: ${JSON.stringify(url)}`,
      "That WTR Lab address isn't a novel page. Open the novel on WTR Lab and copy the " +
        'address of its main page (…/novel/<number>/<name>).',
    );
  }

  /** `props.pageProps.serie.serie_data` from the novel page (fetched once per job). */
  private async serie(session: SourceSession, url: string): Promise<Entry> {
    const page = await session.get(this.canonicalize(url), { reuse: true });
    const script = html.parse(page.text).querySelector(sel.NEXT_DATA);
    if (!script) throw new StructureChanged(`no Next.js page data (${sel.NEXT_DATA}) at ${url}`);
    let serie: unknown;
    try {
      const data = JSON.parse(script.textContent) as {
        props: { pageProps: { serie: { serie_data: unknown } } };
      };
      serie = data.props.pageProps.serie.serie_data;
    } catch (error) {
      throw new StructureChanged(`unexpected Next.js page data at ${url}: ${String(error)}`);
    }
    if (!isEntry(serie)) throw new StructureChanged(`serie_data is not an object at ${url}`);
    return serie;
  }
}

/** A chapter page once its text or the account notice is in; the page's infinite scroll
 * adds the next chapters below, so the first chapter body is the one asked for. */
async function renderChapter(
  session: SourceSession,
  url: string,
): Promise<ChapterHtml & { locked: boolean }> {
  const page = await session.render(url, {
    waitFor: sel.CHAPTER_LOADED,
    challenge: sel.CHAPTER_CHALLENGE,
    timeout: sel.CHAPTER_LOAD_TIMEOUT,
  });
  const content = html.parse(page.text).querySelector(sel.CHAPTER_CONTENT);
  if (!content) throw new StructureChanged(`no chapter text (${sel.CHAPTER_CONTENT}) at ${url}`);
  const locked = !content.querySelector(sel.CHAPTER_TEXT);
  if (locked && !content.querySelector(sel.CHAPTER_LOCKED)) {
    throw new StructureChanged(`no chapter text (${sel.CHAPTER_TEXT}) at ${url}`);
  }
  return { url: page.url, html: content.outerHTML, title: null, locked };
}

/** order → title and date, from a chapter-list answer. */
function chapterEntries(
  body: unknown,
  novelUrl: string,
): Map<number, { title: string; publishedAt: Date | null }> {
  const chapters = isEntry(body) ? body.chapters : null;
  if (!Array.isArray(chapters)) {
    throw new StructureChanged(`the chapter list for ${novelUrl} has no 'chapters' array`);
  }
  const entries = new Map<number, { title: string; publishedAt: Date | null }>();
  for (const chapter of chapters as unknown[]) {
    const order = isEntry(chapter) ? toInt(chapter.order) : null;
    if (!isEntry(chapter) || order === null || order < 1) {
      throw new StructureChanged(
        `unexpected chapter entry for ${novelUrl}: ${JSON.stringify(chapter)}`,
      );
    }
    // Dates look like "2022-01-30 10:11:54.598806+00".
    entries.set(order, {
      title: html.clean(chapter.title) ?? '',
      publishedAt: html.parseIsoDate(chapter.updated_at, true),
    });
  }
  return entries;
}

/** A plain-text description: its paragraphs kept, its whitespace tidied. */
function plainDescription(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const markup = value
    .replace(/\r\n/g, '\n')
    .split('\n\n')
    .map((paragraph) => `<p>${html.escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
  return htmlToText(markup) || null;
}
