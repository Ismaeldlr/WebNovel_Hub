import type {
  ChapterFetchResponse,
  ChapterOrder,
  ChapterPage,
  ExportListResponse,
  ImportEpubResponse,
  ImportUrlResponse,
  JobResponse,
  LibraryItemResponse,
  LibraryPage,
  LibraryQuery,
  LibraryStats,
  LibraryStatus,
  LibraryTag,
  LibraryTagsResponse,
  NewChaptersCount,
  NotifyChoicesResponse,
  NovelDetailsUpdate,
  NovelResponse,
  ReadChapterResponse,
  ReaderChapterResponse,
  RecentImportsResponse,
  SearchResponse,
  SourceAccountResponse,
  SourcesResponse,
  StartUpdateCheckResponse,
  UpdateCheckResponse,
  UpdateRunPage,
  FullFetchResponse,
} from '@webnovel-hub/shared';
import { apiDownload, apiRequest, uploadFile } from './client';

/** Builds `?a=1&b=x` from the defined values. */
function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

const id = (value: string) => encodeURIComponent(value);

/** GET /sources. */
export async function getSources(signal?: AbortSignal) {
  const { sources } = await apiRequest<SourcesResponse>('/sources', { signal });
  return sources;
}

/** /sources/:key/account: sites that show some chapters only to readers signed in there. */
export const accountsApi = {
  status: (source: string, signal?: AbortSignal) =>
    apiRequest<SourceAccountResponse>(`/sources/${id(source)}/account`, { signal }),
  /** Opens the link from the site's sign-in email in the app's web view. */
  signInWithLink: (source: string, link: string) =>
    apiRequest<SourceAccountResponse>(`/sources/${id(source)}/account/link`, {
      method: 'POST',
      body: { link },
    }),
};

/** /import and /jobs. */
export const importsApi = {
  /** Resolves to the job id (202); a 409 throws an ApiError with an ImportConflict. */
  importUrl: async (url: string) =>
    (await apiRequest<ImportUrlResponse>('/import/url', { method: 'POST', body: { url } })).jobId,
  job: async (jobId: string, signal?: AbortSignal) =>
    (await apiRequest<JobResponse>(`/jobs/${id(jobId)}`, { signal })).job,
  recent: async (limit: number, signal?: AbortSignal) =>
    (await apiRequest<RecentImportsResponse>(`/import/recent${query({ limit })}`, { signal })).jobs,
  /** Imports an EPUB file; a 409 throws an ApiError with an ImportConflict. */
  importEpub: (file: File, options: { signal?: AbortSignal } = {}) =>
    uploadFile<ImportEpubResponse>('/import/epub', file, options),
};

export interface ChapterParams {
  page: number;
  limit: number;
  order: ChapterOrder;
  q: string;
}

/** /novels, and managing a novel you imported. */
export const novelsApi = {
  /** PATCH: the title, author, description or tags; resolves to the novel as saved. */
  updateDetails: async (novelId: string, changes: NovelDetailsUpdate) =>
    (
      await apiRequest<NovelResponse>(`/novels/${id(novelId)}`, {
        method: 'PATCH',
        body: changes,
      })
    ).novel,
  /** A new cover image (JPEG, PNG or WebP, at most 8 MB). */
  uploadCover: async (novelId: string, file: File) =>
    (await uploadFile<NovelResponse>(`/novels/${id(novelId)}/cover`, file)).novel,
  /** Deletes the novel and everything stored for it. */
  deleteNovel: async (novelId: string) => {
    await apiRequest<null>(`/novels/${id(novelId)}`, { method: 'DELETE' });
  },
  get: async (novelId: string, signal?: AbortSignal) =>
    (await apiRequest<NovelResponse>(`/novels/${id(novelId)}`, { signal })).novel,
  chapters: (novelId: string, params: ChapterParams, signal?: AbortSignal) =>
    apiRequest<ChapterPage>(`/novels/${id(novelId)}/chapters${query({ ...params })}`, { signal }),
};

/** /library. */
export const libraryApi = {
  /** A page of the library, filtered and sorted. */
  list: (params: LibraryQuery, signal?: AbortSignal) =>
    apiRequest<LibraryPage>(`/library${query({ ...params })}`, { signal }),
  stats: (signal?: AbortSignal) => apiRequest<LibraryStats>('/library/stats', { signal }),
  /** Every tag of the novels in the library, A to Z. */
  tags: async (signal?: AbortSignal): Promise<LibraryTag[]> =>
    (await apiRequest<LibraryTagsResponse>('/library/tags', { signal })).tags,
  newChaptersCount: async (signal?: AbortSignal) =>
    (await apiRequest<NewChaptersCount>('/library/new-chapters-count', { signal })).count,
  remove: (novelId: string) => apiRequest<null>(`/library/${id(novelId)}`, { method: 'DELETE' }),
  setStatus: async (novelId: string, status: LibraryStatus) =>
    (
      await apiRequest<LibraryItemResponse>(`/library/${id(novelId)}/status`, {
        method: 'PATCH',
        body: { status },
      })
    ).item,
  setFavorite: async (novelId: string, isFavorite: boolean) =>
    (
      await apiRequest<LibraryItemResponse>(`/library/${id(novelId)}/favorite`, {
        method: 'PATCH',
        body: { isFavorite },
      })
    ).item,
  /** The novel's own choice about notifications of its new chapters; null drops it. */
  setNotify: async (novelId: string, notify: boolean | null) =>
    (
      await apiRequest<LibraryItemResponse>(`/library/${id(novelId)}/notify`, {
        method: 'PATCH',
        body: { notify },
      })
    ).item,
  notifyChoices: async (signal?: AbortSignal) =>
    (await apiRequest<NotifyChoicesResponse>('/library/notify', { signal })).novels,
};

export const searchApi = {
  /** The global search's best matches, and how many there are in all. */
  search: (q: string, signal?: AbortSignal) =>
    apiRequest<SearchResponse>(`/search${query({ q })}`, { signal }),
};

const chapterPath = (novelId: string, chapter: number) =>
  `/reader/${id(novelId)}/chapters/${chapter}`;

/** /reader. */
export const readerApi = {
  /** 200 ready or failed, 202 while the chapter is being fetched. */
  chapter: (novelId: string, chapter: number, signal?: AbortSignal) =>
    apiRequest<ReaderChapterResponse>(chapterPath(novelId, chapter), { signal }),
  /** Fetches a chapter again after a failure. */
  fetch: (novelId: string, chapter: number) =>
    apiRequest<ChapterFetchResponse>(`${chapterPath(novelId, chapter)}/fetch`, { method: 'POST' }),
  /** Records the read and moves the progress. */
  markRead: async (novelId: string, chapter: number) =>
    (
      await apiRequest<ReadChapterResponse>(`${chapterPath(novelId, chapter)}/read`, {
        method: 'POST',
      })
    ).library,
};

/** Update checks: a novel's manual check and the list of runs. */
export const updatesApi = {
  /** Queues a manual check (202), or returns the novel's check already under way. */
  check: async (novelId: string) =>
    (
      await apiRequest<StartUpdateCheckResponse>(`/novels/${id(novelId)}/update-check`, {
        method: 'POST',
      })
    ).check,
  /** The novel's latest manual check, whoever started it; null if there never was one. */
  latest: async (novelId: string, signal?: AbortSignal) =>
    (await apiRequest<UpdateCheckResponse>(`/novels/${id(novelId)}/update-check`, { signal }))
      .check,
  runs: (page: number, limit: number, signal?: AbortSignal) =>
    apiRequest<UpdateRunPage>(`/update-jobs${query({ page, limit })}`, { signal }),
};

/** "Fetch all chapters" of a novel (plan 18): queue it, follow it, stop it. */
export const fullFetchApi = {
  /** The novel's latest whole-novel fetch, whoever asked, and its stored chapters. */
  get: (novelId: string, signal?: AbortSignal) =>
    apiRequest<FullFetchResponse>(`/novels/${id(novelId)}/fetch-all`, { signal }),
  /** Queues it (202), or returns the one already waiting or running. */
  start: (novelId: string) =>
    apiRequest<FullFetchResponse>(`/novels/${id(novelId)}/fetch-all`, { method: 'POST' }),
  /** Stops the fetch; the chapters stored so far stay. */
  cancel: (novelId: string) =>
    apiRequest<FullFetchResponse>(`/novels/${id(novelId)}/fetch-all`, { method: 'DELETE' }),
};

/** Exporting novels as EPUB files. */
export const exportApi = {
  /** The novels the reader asked to fetch in full, the latest first. */
  list: (signal?: AbortSignal) => apiRequest<ExportListResponse>('/exports', { signal }),
  /** The novel's stored chapters as an EPUB file. */
  epub: (novelId: string) => apiDownload(`/novels/${id(novelId)}/epub`),
};
