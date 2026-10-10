// Page structure of sites built on Madara, a WordPress theme for novel and manga sites.
// Many translation groups run it, so one set of selectors serves them all.

// Novel page (/<novels>/<slug>/)
export const TITLE = '.post-title h1';
/** Badges such as "HOT" or "NEW" inside the title. */
export const TITLE_JUNK = '.manga-title-badges, span';
export const AUTHOR = '.author-content a';
export const DESCRIPTION = '.description-summary, .summary__content';
/** The "Show more" button ("show-more" on the text itself only marks it as folded). */
export const DESCRIPTION_JUNK = '.c-content-readmore';
export const GENRES = '.genres-content a';
export const COVER = '.summary_image img';

// Chapter list (POST /<novels>/<slug>/ajax/chapters/): an HTML fragment, newest first.
export const CHAPTER_LIST_PATH = 'ajax/chapters/';
export const CHAPTERS = 'li.wp-manga-chapter';
/** Chapters sold for coins; translators mark the ones they made free with `free-chap`. */
export const LOCKED_CLASS = 'premium';
export const UNLOCKED_CLASS = 'free-chap';
export const CHAPTER_DATE = '.chapter-release-date';
/** Release dates such as "November 13, 2025" (recent ones say "2 days ago" instead). */
export const DATE_FORMATS = ['%B %d, %Y', '%b %d, %Y', '%d/%m/%Y', '%Y-%m-%d'];

// Chapter page (/<novels>/<slug>/<chapter slug>/)
export const CHAPTER_CONTENT = '.reading-content .text-left';
export const CHAPTER_CONTENT_FALLBACK = '.reading-content';
export const CHAPTER_TITLE = '#chapter-heading';
/** Ad blocks, the theme's notices and toolbars, sharing buttons, translator bio boxes. */
export const CHAPTER_JUNK =
  '.code-block, .adsbygoogle, .chapter-warning, #text-chapter-toolbar, input, .sharedaddy, ' +
  '.jp-relatedposts, .wp-manga-nav, .c-ads, .wp-biographia-container';
