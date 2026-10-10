// Wuxiaworld's page and API structure: when the site changes, this is the file to update.

export const ORIGIN = 'https://www.wuxiaworld.com';

/** /novel/<slug> and /novel/<slug>/<chapter slug>. */
export const NOVEL_PATH = /^\/novel\/(?<slug>[^/]+)(?:\/.*)?$/;

/**
 * The page's data, novel and chapter pages alike:
 * `{"queries": [{"queryKey": [...], "state": {"data": ...}}]}`. The novel's query key
 * starts with "novel" and its slug; a chapter's with "chapter".
 */
export const STATE_MARKER = /window\.__REACT_QUERY_STATE__\s*=\s*/;
export const NOVEL_QUERY = 'novel';
export const CHAPTER_QUERY = 'chapter';

/**
 * The chapter list, from the site's gRPC-web API. Takes
 * `GetChapterListRequest {int32 novelId = 1}`; answers
 * `GetChapterListResponse {repeated ChapterGroupItem items = 1}`.
 */
export const CHAPTER_LIST_URL =
  'https://api2.wuxiaworld.com/wuxiaworld.api.v2.Chapters/GetChapterList';
export const GRPC_HEADERS = {
  'Content-Type': 'application/grpc-web+proto',
  'X-Grpc-Web': '1',
  Origin: ORIGIN,
  Referer: `${ORIGIN}/`,
};
/** ChapterGroupItem (a volume): {int32 id = 1; string title = 2; int32 order = 3; repeated ChapterItem chapterList = 6}. */
export const GROUP_ORDER = 3;
export const GROUP_CHAPTERS = 6;
/**
 * ChapterItem: {int32 entityId = 1; string name = 2; string slug = 3; bool visible = 7;
 * Timestamp publishedAt = 18 {int64 seconds = 1}; ChapterPricing pricingInfo = 20
 * {bool isFree = 1}}.
 */
export const CHAPTER_NAME = 2;
export const CHAPTER_SLUG = 3;
export const CHAPTER_VISIBLE = 7;
export const CHAPTER_PUBLISHED_AT = 18;
export const CHAPTER_PRICING = 20;
export const PRICING_IS_FREE = 1;
export const TIMESTAMP_SECONDS = 1;
