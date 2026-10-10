// Ranobes' page structure: when the site changes its layout, this is the file to update.

/** On every real page, never on DDoS-Guard's check page: rendering waits for it. */
export const PAGE_LOADED = '#dle-content';

// Novel page (https://ranobes.net/novels/<id>-<slug>.html)
/** Structured metadata: {"@type": "Product", "name", "image", "author": {"name"}}. */
export const LD_JSON = 'script[type="application/ld+json"]';
export const TITLE = 'h1.title';
export const DESCRIPTION = '.moreless__full';
/** The "Collapse" link inside the full description. */
export const DESCRIPTION_TOGGLE = '.moreless__toggle';
export const DESCRIPTION_FALLBACK = 'meta[name="description"]';
export const GENRES = '#mc-fs-genre a';
export const COVER_META = 'meta[property="og:image"]';
export const COVER = '.poster img';

/**
 * The chapter index (https://ranobes.net/chapters/<id>/ and …/page/<n>/) as JSON:
 * `window.__DATA__ = {"chapters": [{"id", "title", "date", "link"}], "pages_count",
 * "count_all", …}`. Each page lists 25 chapters, newest first.
 */
export const INDEX_DATA_MARKER = /window\.__DATA__\s*=\s*/;

// Chapter page (https://ranobes.net/<slug>-<id>/<chapter id>.html)
export const CHAPTER_TITLE = 'h1';
export const CHAPTER_CONTENT = '#arrticle';
/** Ad slots inside the chapter text. */
export const CHAPTER_JUNK = ".free-support-top, [id^='bg-ssp']";
