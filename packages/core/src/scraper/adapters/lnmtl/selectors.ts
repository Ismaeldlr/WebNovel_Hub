// LNMTL's page structure and endpoints: when the site changes, this is the file to update.

export const ORIGIN = 'https://lnmtl.com';

/** /novel/<slug>. Chapter pages (/chapter/<slug>) don't name their novel. */
export const NOVEL_PATH = /^\/novel\/(?<slug>[^/]+)\/?$/;

// Novel page (https://lnmtl.com/novel/<slug>)
/** The English name ("King of Worlds"); the page's heading adds the original one. */
export const TITLE_META = 'og:title';
export const TITLE = '.novel-name';
export const DESCRIPTION = '.description';
export const COVER = '.novel .media-left img';
/** The details list: "Authors", "Current status", … */
export const DETAILS = '.panel-body dl';
export const AUTHORS_LABEL = 'Authors';
/** `lnmtl.volumes = [{"id", "number", …}]` in a script. */
export const VOLUMES_MARKER = /lnmtl\.volumes\s*=\s*/;

/** One volume's chapters, 50 a page: {"last_page", "data": [{"position", "title", "slug", "created_at"}]}. */
export const volumeChaptersApi = (page: number, volume: unknown) =>
  `${ORIGIN}/chapter?page=${page}&volumeId=${String(volume)}`;
export const chapterUrl = (slug: string) => `${ORIGIN}/chapter/${slug}`;
export const DATE_FORMAT = '%Y-%m-%d %H:%M:%S';

// Chapter page (https://lnmtl.com/chapter/<slug>)
/**
 * One element per translated sentence (each a paragraph); the original Chinese sentences
 * sit beside them as `.original`.
 */
export const CHAPTER_BODY = '.chapter-body';
export const SENTENCES = '.translated';
export const CHAPTER_TITLE = 'h3.dashhead-title';
