// WTR Lab's page structure and endpoints: when the site changes, this is the file to update.

export const ORIGIN = 'https://wtr-lab.com';

/**
 * /<language>/novel/<id>/<slug>[/chapter-<n>] and the older /<language>/serie-<id>/<slug>.
 */
export const NOVEL_PATH =
  /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:novel\/(?<id>\d+)|serie-(?<legacyId>\d+))\/(?<slug>[^/?#]+)(?:\/.*)?$/i;

/**
 * The novel page's Next.js data. The novel is at props.pageProps.serie.serie_data: its
 * "data" object has title, author, description, image and chapter_count.
 */
export const NEXT_DATA = 'script#__NEXT_DATA__';

/**
 * The endpoint the site's table of contents uses:
 * {"chapters": [{"order", "title", "updated_at", …}]}, all chapters in order.
 */
export const chapterListApi = (novelId: string) => `${ORIGIN}/api/chapters/${novelId}`;
/** Used only when an answer stops short of the novel's chapter count. */
export const chapterRangeApi = (novelId: string, start: number, end: number) =>
  `${ORIGIN}/api/chapters/${novelId}?start=${start}&end=${end}`;
export const chapterUrl = (novelUrl: string, order: number) => `${novelUrl}/chapter-${order}`;

// Chapter page: the text is loaded and assembled by the page's scripts.
/** The chapter text: one `div.wtr-line` per paragraph, glossary terms as inline spans. */
export const CHAPTER_CONTENT = '.chapter-body';
/** The text has loaded: the container appears before the text is loaded into it. */
export const CHAPTER_TEXT = '.wtr-line';
/**
 * Instead of the text, for guests past the first 10 chapters: a notice that the AI
 * translation needs an account, and a link to the chapter in Google's translation.
 */
export const CHAPTER_LOCKED = 'a[href*="service=web"]';
/** Waited for: the text, or the notice that replaces it. */
export const CHAPTER_LOADED = `${CHAPTER_CONTENT} ${CHAPTER_TEXT}, ${CHAPTER_CONTENT} ${CHAPTER_LOCKED}`;
/**
 * Instead of the text, after "unusual reading activity" from the reader's IP address: a
 * Cloudflare Turnstile check. Unless it passes on its own while the page loads, fetching
 * backs off as from any refusal.
 */
export const CHAPTER_CHALLENGE = `${CHAPTER_CONTENT} .turnstile-challenge, ${CHAPTER_CONTENT} [name="cf-turnstile-response"]`;
/** A first load can take half a minute (October 2026). */
export const CHAPTER_LOAD_TIMEOUT = 60_000;
/** The chapter in the site's machine (Google) translation, which guests may read. */
export const machineTranslationUrl = (chapterUrl: string) => `${chapterUrl}?service=web`;

// Account
export const SIGN_IN_URL = `${ORIGIN}/en/auth/login`;
/** 401 {"error":"Unauthorized"} for guests; the reader's settings once signed in. */
export const ACCOUNT_STATUS_URL = `${ORIGIN}/api/v2/user/config`;
