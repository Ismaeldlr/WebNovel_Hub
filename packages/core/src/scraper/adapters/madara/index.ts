// Sites built on the Madara WordPress theme: WuxiaWorld.site, LightNovelHeaven, Sleepy
// Translations, Hiraeth Translation and TranslatinOtaku. Server-rendered pages; the
// theme's own endpoint (a POST to <novel>/ajax/chapters/) returns the whole chapter list,
// newest first. Chapters a translator sells for coins are left out: the app doesn't get
// around paywalls.
//
// Each site keeps its novels under one path (/novel/ or /series/), and canonical URLs are
// https://<site>/<novels>/<slug>/: the slug is the only identifier.
import { StructureChanged, UnsupportedUrl } from '../../errors.js';
import type { SourceSession } from '../../session.js';
import { parseHttpUrl, resolveUrl } from '../../urls.js';
import { Adapter, type ChapterHtml, type ChapterRef, type NovelMeta } from '../base.js';
import * as html from '../html.js';
import * as sel from './selectors.js';

abstract class MadaraAdapter extends Adapter {
  /** The first path segment of novel pages, such as "novel" for /novel/<slug>/. */
  protected readonly novelsPath: string = 'novel';

  canonicalize(url: string): string {
    return `${this.homeUrl}/${this.novelsPath}/${this.slug(url)}/`;
  }

  async fetchNovel(session: SourceSession, url: string): Promise<NovelMeta> {
    const page = await session.get(this.canonicalize(url), { reuse: true });
    const root = html.parse(page.text);
    const heading = root.querySelector(sel.TITLE);
    const title = heading ? html.text(html.strip(heading, sel.TITLE_JUNK)) : '';
    if (!title) throw new StructureChanged(`no novel title (${sel.TITLE}) at ${url}`);
    // The preview image comes last: some sites put their logo there, or a broken address.
    const cover =
      html.imageUrl(root.querySelector(sel.COVER), page.url) ?? html.meta(root, 'og:image');
    return {
      title,
      author: html.firstText(root, sel.AUTHOR) || null,
      description:
        html.description(root.querySelector(sel.DESCRIPTION), sel.DESCRIPTION_JUNK) ??
        html.clean(html.meta(root, 'og:description')),
      tags: html.texts(root.querySelectorAll(sel.GENRES)),
      coverUrl: cover ? resolveUrl(cover, page.url) : null,
    };
  }

  async fetchChapterList(session: SourceSession, url: string): Promise<ChapterRef[]> {
    const endpoint = this.canonicalize(url) + sel.CHAPTER_LIST_PATH;
    const items = html.parse((await session.post(endpoint)).text).querySelectorAll(sel.CHAPTERS);
    if (items.length === 0)
      throw new StructureChanged(`no chapters (${sel.CHAPTERS}) at ${endpoint}`);

    const chapters = new Map<string, ChapterRef>();
    for (const item of items.reverse()) {
      if (
        item.classList.contains(sel.LOCKED_CLASS) &&
        !item.classList.contains(sel.UNLOCKED_CLASS)
      ) {
        continue;
      }
      const link = item.querySelector('a[href]');
      const href = html.attribute(link, 'href');
      const title = html.text(link);
      const chapterUrl = href && href !== '#' ? resolveUrl(href, this.homeUrl) : null;
      if (!chapterUrl || !title || chapters.has(chapterUrl)) continue;
      chapters.set(chapterUrl, {
        url: chapterUrl,
        title,
        publishedAt: html.parseDate(
          html.text(item.querySelector(sel.CHAPTER_DATE)),
          ...sel.DATE_FORMATS,
        ),
      });
    }
    return [...chapters.values()];
  }

  async fetchChapter(session: SourceSession, ref: ChapterRef): Promise<ChapterHtml> {
    const page = await session.get(ref.url);
    const root = html.parse(page.text);
    const content =
      root.querySelector(sel.CHAPTER_CONTENT) ?? root.querySelector(sel.CHAPTER_CONTENT_FALLBACK);
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
    const path = new RegExp(`^/${this.novelsPath}/(?<slug>[^/]+)(?:/.*)?$`);
    const slug = this.hosts.has(parts.hostname)
      ? path.exec(parts.pathname)?.groups?.slug
      : undefined;
    if (slug) return slug;
    throw new UnsupportedUrl(
      `not a ${this.name} novel URL: ${JSON.stringify(url)}`,
      `That ${this.name} address isn't a novel page. Open the novel on ${this.name} and copy ` +
        `the address of its page (…/${this.novelsPath}/<name>/) or of any chapter.`,
    );
  }
}

export class WuxiaWorldSiteAdapter extends MadaraAdapter {
  readonly source = 'wuxiaworld_site';
  readonly name = 'WuxiaWorld.site';
  readonly homeUrl = 'https://wuxiaworld.site';
  readonly hosts = new Set(['wuxiaworld.site', 'www.wuxiaworld.site']);
}

export class LightNovelHeavenAdapter extends MadaraAdapter {
  readonly source = 'light_novel_heaven';
  readonly name = 'LightNovelHeaven';
  readonly homeUrl = 'https://lightnovelheaven.com';
  readonly hosts = new Set(['lightnovelheaven.com', 'www.lightnovelheaven.com']);
  protected override readonly novelsPath = 'series';
}

export class SleepyTranslationsAdapter extends MadaraAdapter {
  readonly source = 'sleepy_translations';
  readonly name = 'Sleepy Translations';
  readonly homeUrl = 'https://sleepytranslations.com';
  readonly hosts = new Set(['sleepytranslations.com', 'www.sleepytranslations.com']);
  protected override readonly novelsPath = 'series';
}

export class HiraethTranslationAdapter extends MadaraAdapter {
  readonly source = 'hiraeth_translation';
  readonly name = 'Hiraeth Translation';
  readonly homeUrl = 'https://hiraethtranslation.com';
  readonly hosts = new Set(['hiraethtranslation.com', 'www.hiraethtranslation.com']);
}

export class TranslatinOtakuAdapter extends MadaraAdapter {
  readonly source = 'translatin_otaku';
  readonly name = 'TranslatinOtaku';
  readonly homeUrl = 'https://translatinotaku.net';
  readonly hosts = new Set(['translatinotaku.net', 'www.translatinotaku.net']);
}
