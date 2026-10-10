// Page structure of the NovelFull-style sites, one layout per site. They descend from
// one template (novel page, an endpoint that returns the whole chapter list as HTML,
// chapter pages), but each has drifted in its own way.

export interface Layout {
  origin: string;
  /** Matches the novel page and its chapter pages; the `slug` group names the novel. */
  novelPath: RegExp;
  novelUrl: (slug: string) => string;
  /** The chapter list endpoint, for the novel's id (or slug). */
  chapterListUrl: (id: string) => string;
  /** The element whose `data-novel-id` the endpoint wants; null when it takes the slug. */
  novelId: string | null;
  /**
   * One element per chapter in the endpoint's answer, oldest first: links (href and
   * title) or select options (value and text).
   */
  chapterItems: string;
  title: string;
  author: string;
  genres: string;
  description: string;
  cover: string;
  chapterContent: string;
  chapterTitle: string;
  chapterJunk: string;
}

/** /<slug>.html and /<slug>/<chapter>.html */
const HTML_PATHS = /^\/(?<slug>\w[\w-]*)(?:\/[^/]+)?\.html$/;
/** Ad slots inside the chapter text. */
const JUNK = ".ads, .adsbygoogle, .js-ad-slot, [id^='pf-'], .unlock-buttons";

const READNOVELFULL_ORIGIN = 'https://readnovelfull.com';
export const READNOVELFULL: Layout = {
  origin: READNOVELFULL_ORIGIN,
  novelPath: HTML_PATHS,
  novelUrl: (slug) => `${READNOVELFULL_ORIGIN}/${slug}.html`,
  chapterListUrl: (id) => `${READNOVELFULL_ORIGIN}/ajax/chapter-archive?novelId=${id}`,
  novelId: '#rating[data-novel-id]',
  chapterItems: 'a[href]',
  title: 'h3.title',
  author: ".info-meta a[href*='/authors/']",
  genres: ".info-meta a[href*='/genres/']",
  description: '.desc-text',
  cover: '.book img',
  chapterContent: '#chr-content',
  chapterTitle: '.chr-text',
  chapterJunk: JUNK,
};

const NOVGO_ORIGIN = 'https://novgo.net';
export const NOVGO: Layout = {
  origin: NOVGO_ORIGIN,
  novelPath: HTML_PATHS,
  novelUrl: (slug) => `${NOVGO_ORIGIN}/${slug}.html`,
  chapterListUrl: (id) => `${NOVGO_ORIGIN}/ajax-chapter-option?novelId=${id}`,
  novelId: '[data-novel-id]',
  chapterItems: 'option[value]',
  title: 'h1.tit',
  author: ".m-imgtxt a[href^='/author/']",
  genres: ".m-imgtxt a[href^='/genre/']",
  description: '.m-desc .inner',
  cover: '.m-imgtxt img',
  chapterContent: '#chapter-content',
  chapterTitle: '.chapter-title',
  chapterJunk: JUNK,
};

const NOVELPING_ORIGIN = 'https://novelping.com';
export const NOVELPING: Layout = {
  origin: NOVELPING_ORIGIN,
  novelPath: /^\/book\/(?<slug>[^/]+)(?:\/[^/]+)?\/?$/,
  novelUrl: (slug) => `${NOVELPING_ORIGIN}/book/${slug}`,
  chapterListUrl: (id) => `${NOVELPING_ORIGIN}/ajax/chapter-archive?novelId=${id}`,
  novelId: null,
  // The list comes inside <template> elements; the parser reads into them.
  chapterItems: 'a[href]',
  title: 'h3.title',
  author: ".info-meta a[href*='/author/']",
  genres: ".info-meta a[href*='-genres/']",
  description: '.desc-text',
  cover: '.book img',
  chapterContent: '#chr-content',
  chapterTitle: '.chr-text',
  chapterJunk: JUNK,
};
