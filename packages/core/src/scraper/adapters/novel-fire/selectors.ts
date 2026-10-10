// Novel Fire's page structure: when the site changes its layout, this is the file to update.

export const ORIGIN = 'https://novelfire.net';

/**
 * Novel pages and everything under them: /book/<slug>, /book/<slug>/chapters,
 * /book/<slug>/chapter-<n>, /book/<slug>/reviews. The slug is the only identifier.
 */
export const NOVEL_PATH = /^\/book\/(?<slug>[^/]+)(?:\/.*)?$/;

// Novel page (https://novelfire.net/book/<slug>)
export const TITLE = 'h1.novel-title';
export const AUTHOR = ".novel-info .author [itemprop='author']";
export const DESCRIPTION = '.summary .content';
/** The "Show More" button inside the description. */
export const DESCRIPTION_JUNK = '.expand';
export const GENRES = '.categories a.property-item';
export const COVER = '.cover img';

// Chapter index (https://novelfire.net/book/<slug>/chapters?page=<n>): 100 chapters a
// page, oldest first.
export const CHAPTER_LINKS = 'ul.chapter-list li a';
export const CHAPTER_TITLE_IN_LINK = '.chapter-title';
export const CHAPTER_DATE_IN_LINK = 'time[datetime]';
export const CHAPTER_DATE_FORMAT = '%Y-%m-%d %H:%M';
export const PAGE_LINKS = ".pagination a[href*='page=']";
export const PAGE_NUMBER = /[?&]page=(\d+)/;

// Chapter page (https://novelfire.net/book/<slug>/chapter-<n>)
export const CHAPTER_CONTENT = '#content';
export const CHAPTER_TITLE = '.chapter-title';
/** Ad slots and notices that sometimes appear between paragraphs. */
export const CHAPTER_JUNK = '.ads, .adsbygoogle, .box-ads, .box-notification';
