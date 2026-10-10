// Page structure of the Readwn-style sites (WuxiaBox, FanMTL, WuxiaSpot): one site
// template on three domains.

/** /novel/<slug>.html (the novel) and /novel/<slug>_<n>.html (its n-th chapter). */
export const NOVEL_PATH = /^\/novel\/(?<slug>[^/_]+?)(?:_\d+)?\.html$/;

// Novel page (/novel/<slug>.html)
export const TITLE = 'h1.novel-title';
export const AUTHOR = ".novel-info .author [itemprop='author']";
export const DESCRIPTION = '.summary .content';
export const GENRES = '.categories a.property-item';
export const COVER = 'figure.cover img';

/**
 * The chapter index: an HTML fragment of 100 chapters a page (numbered from 0), oldest
 * first. A page past the last one is empty or repeats the last page.
 */
export const indexUrl = (origin: string, page: number, slug: string) =>
  `${origin}/e/extend/fy.php?page=${page}&wjm=${slug}`;
export const CHAPTER_LINKS = 'ul.chapter-list li a';
export const CHAPTER_TITLE_IN_LINK = '.chapter-title';

// Chapter page (/novel/<slug>_<n>.html)
export const CHAPTER_CONTENT = '.chapter-content';
export const CHAPTER_TITLE = '.titles h2';
/** Ad scripts in centered boxes, and the site's navigation if it ends up inside. */
export const CHAPTER_JUNK = "div[align='center'], .chapternav, .guide-message";
