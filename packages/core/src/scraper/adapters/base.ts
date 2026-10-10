import type { SourceSession } from '../session.js';
import { parseHttpUrl } from '../urls.js';

export interface NovelMeta {
  title: string;
  author: string | null;
  description: string | null;
  tags: string[];
  coverUrl: string | null;
}

/** One entry of a novel's chapter list, in reading order. */
export interface ChapterRef {
  url: string;
  /** The site's own label, such as "Chapter 12.5: The Bridge". */
  title: string;
  publishedAt: Date | null;
}

export interface ChapterHtml {
  url: string;
  /**
   * The element holding the chapter text, as HTML, with the site's own junk (such as
   * hidden anti-piracy lines) already removed. The shared normalizer does the rest.
   */
  html: string;
  title: string | null;
}

/**
 * Everything about one source site: its addresses and how to read its pages. It knows
 * nothing about the database or jobs, fetches only through the session it is given, and
 * throws `StructureChanged` when something it needs is missing from a page.
 */
/**
 * A site account the app signs in to through its web view, whose cookies the rendered
 * pages then share. The reader signs in on the site's own page, in a window of the app.
 */
export interface SiteAccount {
  /** The site's sign-in page. */
  signInUrl: string;
  /** A page whose rendered text tells whether the web view is signed in. */
  statusUrl: string;
  /** From the status page's HTML: signed in, signed out, or null when it can't tell. */
  signedIn(html: string): boolean | null;
}

export abstract class Adapter {
  /** The `source_sites` key stored on novels, such as `royal_road`. */
  abstract readonly source: string;
  /** The site's name in messages. */
  abstract readonly name: string;
  abstract readonly homeUrl: string;
  /** Every lower-case host name the site answers on, mirrors included. */
  abstract readonly hosts: ReadonlySet<string>;
  /** Milliseconds between two requests to this site, when it needs more than the default. */
  readonly requestDelay: number | null = null;
  /**
   * Milliseconds between chapters when fetching a whole novel, before jitter and any
   * slowdown the site asked for: a whole novel should arrive like a patient reader, not a
   * crawler.
   */
  readonly fetchAllDelay: number = 15_000;
  /**
   * The site is supported but doesn't work reliably yet. It stays importable and is listed
   * apart, so readers know what to expect.
   */
  readonly inProgress: boolean = false;
  /** The site's account, for sites that show some pages only to signed-in readers. */
  readonly account: SiteAccount | null = null;

  /** Whether `url` is any page of this site. */
  matches(url: string): boolean {
    try {
      return this.hosts.has(parseHttpUrl(url).hostname);
    } catch {
      return false;
    }
  }

  /**
   * The novel's canonical URL; chapter URLs map to their novel. Throws `UnsupportedUrl`
   * for a page of this site that is neither.
   */
  abstract canonicalize(url: string): string;

  /**
   * What identifies a chapter within its novel, whatever its URL looks like today. Update
   * checks match the site's chapter list to the stored chapters by it, so a chapter whose
   * URL changed isn't taken for a new one. Sites whose chapter URLs carry a slug that
   * changes on a rename return the part that doesn't, usually the chapter's id.
   */
  chapterKey(url: string): string {
    return url;
  }

  /** Metadata for the novel at its canonical `url`. */
  abstract fetchNovel(session: SourceSession, url: string): Promise<NovelMeta>;

  /** The complete chapter list, in reading order. */
  abstract fetchChapterList(session: SourceSession, url: string): Promise<ChapterRef[]>;

  abstract fetchChapter(session: SourceSession, ref: ChapterRef): Promise<ChapterHtml>;
}
