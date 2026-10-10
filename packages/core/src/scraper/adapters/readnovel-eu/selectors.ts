// ReadNovel.eu's page structure: when the site changes, this is the file to update.

export const ORIGIN = 'https://readnovel.eu';

/** /novel/<slug> (the novel) and /chapter/<slug>-<n> (its n-th chapter). */
export const NOVEL_PATH = /^\/novel\/(?<slug>[^/]+)\/?$/;
export const CHAPTER_PATH = /^\/chapter\/(?<slug>[^/]+)-\d+\/?$/;

/** Every page's data, as JSON: `props.pageProps`. */
export const NEXT_DATA = 'script#__NEXT_DATA__';

/**
 * The novel page, one page of its chapter list per `page`. Its data has `novel` (title,
 * description, author {name}, genres [{name}], coverKey, coverOriginal) and `toc`:
 * `items` [{number, title, createdAt}], 100 a page, and `ranges` [{page, from, to}].
 */
export const novelPage = (slug: string, page = 1) =>
  page === 1 ? `${ORIGIN}/novel/${slug}` : `${ORIGIN}/novel/${slug}?page=${page}`;

/** A chapter page: `data.chapter` has `title` and `paragraphs`, plain text. */
export const chapterUrl = (slug: string, number: number) => `${ORIGIN}/chapter/${slug}-${number}`;

const CDN = 'https://cdn.wuxiaworld.eu';
/** Covers come in 240 and 480 pixel widths; the original file when there is no key. */
export const coverUrl = (key: string) => `${CDN}/${key}-480.webp`;
export const originalCoverUrl = (path: string) => `${CDN}/${path}`;
