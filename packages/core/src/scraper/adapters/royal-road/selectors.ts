// Royal Road's page structure: when the site changes its layout, this is the file to
// update (then refresh the saved pages and run a live check).

// Fiction page (https://www.royalroad.com/fiction/<id>/<slug>)
export const TITLE = '.fic-title h1';
export const AUTHOR = '.fic-title h4 a';
export const AUTHOR_META = 'meta[property="books:author"]';
export const DESCRIPTION = '.fiction-info .description .hidden-content';
export const DESCRIPTION_FALLBACK = '.fiction-info .description';
export const TAGS = '.fiction-info span.tags a.fiction-tag';
export const COVER = 'img.thumbnail[data-type="cover"]';
export const COVER_META = 'meta[property="og:image"]';
/** Royal Road's placeholder image for fictions without a cover. */
export const NO_COVER_MARKER = 'nocover';

/**
 * The chapter list as JSON in a script, `window.chapters = [...];`. Each entry has id,
 * title, url, date (ISO 8601), order, visible and isUnlocked.
 */
export const CHAPTERS_SCRIPT_MARKER = /window\.chapters\s*=\s*/;
/** The table of contents, when the script is missing. */
export const CHAPTER_TABLE = 'table#chapters';
export const CHAPTER_ROWS = 'table#chapters tbody tr.chapter-row';
export const CHAPTER_ROW_LINK = 'td a[href]';
export const CHAPTER_ROW_TIME = 'time[datetime]';

// Chapter page (.../chapter/<chapter id>/<slug>)
export const CHAPTER_TITLE = '.fic-header h1';
/** The chapter text. Author notes and comments are outside it. */
export const CHAPTER_CONTENT = '.chapter-inner.chapter-content';
/**
 * Anti-piracy lines carry a random class that a `<style>` block on the page hides:
 * `.cmZk…{ display: none; speak: never; }`.
 */
export const HIDDEN_CLASS_RULE = /\.([A-Za-z0-9_-]+)\s*\{[^}]*?display\s*:\s*none/gi;
