import {
  type ChapterSummary,
  EDITABLE_PREFERENCES,
  type HistoryEntry,
  type HistoryNovelItem,
  type IngestionJob,
  LIBRARY_STATUSES,
  type LibraryItem,
  type LibrarySort,
  type LibraryState,
  type LibraryStatus,
  type NovelDetail,
  type NovelSummary,
  type Profile,
  READER_PREFERENCE_DEFAULTS,
  type ReaderChapterResponse,
  type ReaderPreferences,
  type SourceRef,
  type SourceSite,
  type UpdateRun,
  type FullFetch,
  isJobFinished,
} from '@webnovel-hub/shared';
import { setDispatch } from '../api/client';

export const SOURCES: SourceSite[] = [
  {
    key: 'royal_road',
    name: 'Royal Road',
    homeUrl: 'https://www.royalroad.com',
    hosts: ['royalroad.com', 'www.royalroad.com'],
    importable: true,
    inProgress: false,
  },
  {
    key: 'wtr_lab',
    name: 'WTR Lab',
    homeUrl: 'https://wtr-lab.com',
    hosts: ['wtr-lab.com'],
    importable: true,
    inProgress: false,
  },
  {
    key: 'ranobes',
    name: 'Ranobes',
    homeUrl: 'https://ranobes.net',
    hosts: ['ranobes.net'],
    importable: true,
    inProgress: true,
  },
  { key: 'epub', name: 'EPUB', homeUrl: null, hosts: [], importable: false, inProgress: false },
];

type SearchItem = { novel: NovelSummary; inLibrary: boolean };

type Novel = Omit<NovelDetail, 'library'>;

export interface FakeApi {
  /** When true, every request fails as if the library couldn't be read. */
  unreachable: boolean;
  /** "METHOD /path?query" of every request, in order. */
  calls: string[];
  /** The catalog: novels and their chapters. */
  novels: Map<string, { novel: Novel; chapters: ChapterSummary[] }>;
  /** The library, by novel id. */
  library: Map<string, LibraryState>;
  jobs: Map<string, IngestionJob>;
  /**
   * How the worker moves an import along: each poll of GET /jobs/:id applies the next
   * change in the job's script, so a test can walk it from pending to completed.
   */
  jobScripts: Map<string, Partial<IngestionJob>[]>;
  /** Script given to the next job POST /import/url creates. */
  nextJobScript: Partial<IngestionJob>[];
  /** Stored chapter text, by chapter id. */
  contents: Map<string, string>;
  /**
   * Chapters being fetched by the fake worker, by chapter id: the job id and how many more
   * reader polls answer 202 before the fetch finishes.
   */
  fetches: Map<string, { jobId: string; polls: number }>;
  /** How many polls a new fetch takes, and whether it then succeeds or fails. */
  fetchPolls: number;
  fetchOutcome: 'ready' | 'fail';
  /** Every chapter marked read, as "novelId/number". */
  reads: string[];
  /** The latest manual update check of each novel, by novel id. */
  updateChecks: Map<string, UpdateRun>;
  /**
   * How the worker moves a novel's check along: after each poll of
   * GET /novels/:id/update-check, the next change is applied. A completed check that found
   * chapters adds them to the novel as NEW; a failed one with errors flags the novel.
   */
  checkScript: Partial<UpdateRun>[];
  /** GET /update-jobs, newest first. */
  updateRuns: UpdateRun[];
  /** The latest "Fetch all chapters" of each novel, by novel id. */
  fullFetches: Map<string, FullFetch>;
  /**
   * How the worker moves a novel's fetch along: after each poll of
   * GET /novels/:id/fetch-all, the next change is applied, with `stored` more chapters
   * stored. A completed fetch stores the rest.
   */
  fullFetchScript: (Partial<FullFetch> & { stored?: number })[];
  /** The signed-in user's preferences (GET and PATCH /user/preferences, reader responses). */
  preferences: ReaderPreferences;
  /** Every PATCH /user/preferences body, in order. */
  preferenceSaves: Record<string, unknown>[];
  /** GET /sources/wtr_lab/account: null when this device can't tell (the default). */
  wtrLabSignedIn: boolean | null;
  /** When set, PATCH /user/preferences fails with a 400 and this message. */
  preferenceSaveError: string | null;
  /** When set, GET /user/preferences waits for it: the server is slow to answer. */
  preferencesGate: Promise<void> | null;
  /** The names of the files POST /import/epub received. */
  epubUploads: string[];
  /**
   * How the next EPUB upload is answered: a new novel (201), a file someone else had
   * imported (200, duplicate), one already in the library (409), or a failure.
   */
  epubOutcome: 'created' | 'duplicate' | 'conflict' | { status: number; error: string };
  /** When set, an upload waits for it after reporting half of its bytes sent. */
  uploadGate: Promise<void> | null;
  /** Chapter reads for /history, newest first (see addRead); days are in UTC. */
  history: HistoryEntry[];
  /** How many entries a page of GET /history holds. */
  historyPageSize: number;
  /** GET /user/profile; null answers as a reader with nothing read yet. */
  profile: Profile | null;
  /** The bodies of successful password changes. */
  /** Management calls: `PATCH <id>`, `POST <id>`, `DELETE <id>`. */
  manageCalls: string[];
}

/** What cards and search results show of a novel (NovelSummary). */
function summary(novel: NovelSummary): NovelSummary {
  return {
    id: novel.id,
    source: novel.source,
    title: novel.title,
    author: novel.author,
    coverUrl: novel.coverUrl,
    totalChapters: novel.totalChapters,
    updateFailure: novel.updateFailure,
    lastCheckedAt: novel.lastCheckedAt,
    latestChapterAt: novel.latestChapterAt,
  };
}

/** The API's title/author search: every word, anywhere in the title or the author. */
function matchesWords(novel: NovelSummary, text: string): boolean {
  const haystack = `${novel.title}\n${novel.author ?? ''}`.toLowerCase();
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

const byTitle = (a: { novel: NovelSummary }, b: { novel: NovelSummary }) =>
  a.novel.title.localeCompare(b.novel.title, 'en', { sensitivity: 'base' });

const percent = ({ novel, library }: LibraryItem) =>
  novel.totalChapters > 0
    ? Math.min(library.furthestChapterNumber ?? 0, novel.totalChapters) / novel.totalChapters
    : 0;

/** The API's library orders; ties go by title. */
const LIBRARY_ORDER: Record<LibrarySort, (a: LibraryItem, b: LibraryItem) => number> = {
  last_read: (a, b) =>
    (b.library.lastReadAt ?? b.library.addedAt).localeCompare(
      a.library.lastReadAt ?? a.library.addedAt,
    ),
  last_updated: (a, b) =>
    (b.novel.latestChapterAt ?? '').localeCompare(a.novel.latestChapterAt ?? ''),
  title: () => 0,
  added: (a, b) => b.library.addedAt.localeCompare(a.library.addedAt),
  progress: (a, b) => percent(b) - percent(a),
};

/** The text the fake worker stores for a chapter. */
export const chapterText = (number: number) =>
  `The opening of chapter ${number}.\n\nA second paragraph,\nwith a line break.`;

let counter = 0;

interface NovelOptions {
  title?: string;
  author?: string | null;
  /** A source other than Royal Road. */
  source?: SourceRef;
  /** When it entered the catalog (Explore's order). */
  createdAt?: string;
  latestChapterAt?: string | null;
  chapters?: number;
  sourceUrl?: string;
  tags?: string[];
  /** An EPUB import: no source site, nothing to check for updates. */
  epub?: boolean;
  /** Put it in the library, with this state. */
  library?: Partial<LibraryState>;
  read?: number[];
  newChapters?: number[];
  failed?: number[];
  /** Chapter numbers whose text is stored. */
  fetched?: number[];
}

/** Adds a novel to the fake catalog; returns its id. */
export function addNovel(api: FakeApi, options: NovelOptions = {}): string {
  counter += 1;
  const id = `novel-${counter}`;
  const total = options.chapters ?? 10;
  const novel: Novel = {
    id,
    source: options.epub
      ? { key: 'epub', name: 'EPUB' }
      : (options.source ?? { key: 'royal_road', name: 'Royal Road' }),
    sourceUrl: options.epub
      ? null
      : (options.sourceUrl ?? `https://www.royalroad.com/fiction/${counter}`),
    title: options.title ?? `Novel ${counter}`,
    author: options.author === undefined ? 'A. Writer' : options.author,
    description: 'A first paragraph.\n\nA second paragraph.',
    tags: options.tags ?? ['Fantasy', 'Adventure'],
    coverUrl: null,
    totalChapters: total,
    updateFailure: null,
    lastCheckedAt: '2026-09-26T10:00:00.000Z',
    lastScrapedAt: '2026-09-26T10:00:00.000Z',
    latestChapterAt:
      options.latestChapterAt === undefined ? '2026-09-25T10:00:00.000Z' : options.latestChapterAt,
    createdAt: options.createdAt ?? '2026-09-20T10:00:00.000Z',
    updatedAt: '2026-09-26T10:00:00.000Z',
  };
  const chapters = Array.from({ length: total }, (_, index): ChapterSummary => {
    const number = index + 1;
    return {
      id: `${id}-c${number}`,
      number,
      title: `Chapter ${number}: Part ${number}`,
      publishedAt: '2026-09-01T10:00:00.000Z',
      isFetched: options.fetched?.includes(number) ?? false,
      fetchFailure: options.failed?.includes(number)
        ? { type: 'network_error', message: "We couldn't reach Royal Road." }
        : null,
      isRead: options.read?.includes(number) ?? false,
      isNew: options.newChapters?.includes(number) ?? false,
    };
  });
  api.novels.set(id, { novel, chapters });
  for (const number of options.fetched ?? []) {
    api.contents.set(`${id}-c${number}`, chapterText(number));
  }
  if (options.library) {
    api.library.set(id, {
      status: 'reading',
      isFavorite: false,
      lastReadChapterNumber: null,
      furthestChapterNumber: null,
      newChapterCount: options.newChapters?.length ?? 0,
      addedAt: new Date(Date.UTC(2026, 8, 1, 0, counter)).toISOString(),
      lastReadAt: null,
      ...options.library,
    });
  }
  return id;
}

/**
 * Answers the app's requests in memory, like its core: the envelope, the status codes
 * and the messages.
 */
export function fakeApi(initial: Partial<Pick<FakeApi, 'unreachable'>> = {}): FakeApi {
  const api: FakeApi = {
    unreachable: initial.unreachable ?? false,
    calls: [],
    novels: new Map(),
    library: new Map(),
    jobs: new Map(),
    jobScripts: new Map(),
    nextJobScript: [],
    contents: new Map(),
    fetches: new Map(),
    fetchPolls: 1,
    fetchOutcome: 'ready',
    reads: [],
    updateChecks: new Map(),
    checkScript: [],
    updateRuns: [],
    fullFetches: new Map(),
    fullFetchScript: [],
    preferences: { ...READER_PREFERENCE_DEFAULTS },
    preferenceSaves: [],
    wtrLabSignedIn: null,
    preferenceSaveError: null,
    preferencesGate: null,
    epubUploads: [],
    epubOutcome: 'created',
    uploadGate: null,
    history: [],
    historyPageSize: 50,
    profile: null,
    manageCalls: [],
  };

  const reply = (status: number, data: unknown, error: string | null = null) =>
    new Response(JSON.stringify({ success: error === null, data: data ?? null, error }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  const notFound = (message = 'Not found.') => reply(404, null, message);
  const bad = (message: string) => reply(400, null, message);

  const item = (id: string): LibraryItem | null => {
    const entry = api.novels.get(id);
    const library = api.library.get(id);
    if (!entry || !library) return null;
    return { novel: summary(entry.novel), library };
  };
  const novelTags = (id: string) => api.novels.get(id)?.novel.tags ?? [];

  /** Novels whose title or author has every word of `text`. */
  const catalogItems = (text: string): SearchItem[] =>
    [...api.novels.values()]
      .filter(({ novel }) => matchesWords(novel, text))
      .map(({ novel }) => ({ novel: summary(novel), inLibrary: api.library.has(novel.id) }));

  const emptyProfile = (): Profile => ({
    timezone: 'UTC',
    totals: {
      chaptersRead: 0,
      novelsRead: 0,
      authorsRead: 0,
      wordsRead: 0,
      readingDays: 0,
      reads: 0,
    },
    streaks: { current: 0, longest: 0, lastReadDate: null },
    activity: [],
    library: {
      total: 0,
      byStatus: { reading: 0, following: 0, on_hold: 0, dropped: 0, completed: 0 },
      bySource: [],
    },
    mostRead: [],
    longestNovel: null,
  });

  /** /history, over `api.history`; cursors are offsets. */
  const history = (route: string, search: URLSearchParams) => {
    const range = search.get('range') ?? 'all';
    const today = new Date().toISOString().slice(0, 10);
    const since = range === '7d' ? 6 : range === '30d' ? 29 : null;
    const oldest =
      since === null
        ? ''
        : new Date(Date.parse(today) - since * 86_400_000).toISOString().slice(0, 10);
    const novelId = search.get('novelId');
    const entries = api.history.filter(
      (entry) => entry.date >= oldest && (novelId === null || entry.novel.id === novelId),
    );
    const distinct = (values: unknown[]) => new Set(values).size;
    switch (route) {
      case 'GET /history': {
        const start = Number(search.get('cursor') ?? 0);
        const end = start + api.historyPageSize;
        return reply(200, {
          items: entries.slice(start, end),
          nextCursor: end < entries.length ? String(end) : null,
          timezone: 'UTC',
        });
      }
      case 'GET /history/stats':
        return reply(200, {
          chaptersRead: distinct(entries.map((e) => `${e.novel.id}:${e.chapter.number}`)),
          novelsRead: distinct(entries.map((e) => e.novel.id)),
          authorsRead: distinct(entries.map((e) => e.novel.author).filter(Boolean)),
          reads: entries.length,
        });
      case 'GET /history/novels': {
        const q = search.get('q') ?? '';
        const seen = new Map<string, HistoryEntry>();
        for (const entry of api.history)
          if (!seen.has(entry.novel.id)) seen.set(entry.novel.id, entry);
        const novels = [...seen.values()]
          .filter((entry) => {
            const novel = api.novels.get(entry.novel.id)?.novel;
            return !q || (novel !== undefined && matchesWords(novel, q));
          })
          .map((entry) => ({ ...entry.novel, lastReadAt: entry.readAt }));
        return reply(200, { novels });
      }
      default: {
        const byNovel = new Map<string, HistoryEntry[]>();
        for (const entry of entries) {
          byNovel.set(entry.novel.id, [...(byNovel.get(entry.novel.id) ?? []), entry]);
        }
        const items: HistoryNovelItem[] = [...byNovel.entries()].flatMap(([id, reads]) => {
          const novel = api.novels.get(id)?.novel;
          const [last] = reads;
          if (!novel || !last) return [];
          const library = api.library.get(id);
          const highest = Math.max(...reads.map((e) => e.chapter.number));
          return [
            {
              novel: summary(novel),
              chaptersRead: distinct(reads.map((e) => e.chapter.number)),
              reads: reads.length,
              lastReadAt: last.readAt,
              lastChapter: last.chapter,
              furthestChapterNumber: library?.furthestChapterNumber ?? highest,
              continueChapterNumber: library?.lastReadChapterNumber ?? last.chapter.number,
              inLibrary: library !== undefined,
            },
          ];
        });
        return reply(200, { items, page: 1, limit: 24, total: items.length });
      }
    }
  };

  /** Editing a novel's details or cover, or deleting it. */
  const manage = (method: string, route: string, id: string, body: Record<string, unknown>) => {
    const entry = api.novels.get(id);
    if (!entry) return notFound('Novel not found.');
    const { novel } = entry;
    api.manageCalls.push(`${method} ${id}`);
    if (method === 'DELETE') {
      api.novels.delete(id);
      api.library.delete(id);
      return reply(200, null);
    }
    if (route === 'POST /novels/:id/cover') {
      if (!(body.cover instanceof File)) return bad('Choose an image for the cover.');
      novel.coverUrl = `/covers/${id}-${api.manageCalls.length}.png`;
    } else {
      if (typeof body.title === 'string') novel.title = body.title.trim();
      if (body.author !== undefined) novel.author = (body.author as string) || null;
      if (body.description !== undefined) novel.description = (body.description as string) || null;
      if (Array.isArray(body.tags)) novel.tags = body.tags as string[];
    }
    return reply(200, { novel: { ...novel, library: api.library.get(id) ?? null } });
  };

  /** POST /import/epub: the novel is named after the file. */
  const importEpub = (file: unknown) => {
    if (!(file instanceof File)) return bad('Choose an EPUB file to import.');
    api.epubUploads.push(file.name);
    const outcome = api.epubOutcome;
    if (typeof outcome === 'object') return reply(outcome.status, null, outcome.error);
    const title = file.name.replace(/\.epub$/i, '');
    const novelId = addNovel(api, {
      epub: true,
      title,
      chapters: 3,
      fetched: [1, 2, 3],
      library: {},
    });
    if (outcome === 'conflict') {
      return reply(
        409,
        { novelId, title, inLibrary: true },
        'This EPUB is already in your library.',
      );
    }
    const novel = api.novels.get(novelId)?.novel;
    if (!novel) return notFound();
    return reply(outcome === 'created' ? 201 : 200, {
      novel: summary(novel),
      wordCount: 1234,
      duplicate: outcome === 'duplicate',
    });
  };

  const importUrl = (value: unknown) => {
    const url = typeof value === 'string' ? value.trim() : '';
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return bad("That doesn't look like a web address. Paste the novel's full URL.");
    }
    const source = SOURCES.find((site) => site.importable && site.hosts.includes(parsed.hostname));
    if (!source) return bad("This site isn't supported. Supported sites: Royal Road, WTR Lab.");
    const existing = [...api.novels.values()].find((entry) => entry.novel.sourceUrl === url);
    if (existing) {
      return reply(
        409,
        {
          novelId: existing.novel.id,
          title: existing.novel.title,
          inLibrary: api.library.has(existing.novel.id),
        },
        'This novel is already in your library.',
      );
    }
    counter += 1;
    const job: IngestionJob = {
      id: `job-${counter}`,
      type: 'novel_ingestion',
      status: 'pending',
      url,
      source: { key: source.key, name: source.name },
      progressMessage: 'Waiting to start…',
      progressPercent: null,
      error: null,
      retryCount: 0,
      maxRetries: 3,
      result: null,
      createdAt: new Date(Date.UTC(2026, 8, 27, 0, counter)).toISOString(),
      startedAt: null,
      finishedAt: null,
      updatedAt: new Date().toISOString(),
    };
    api.jobs.set(job.id, job);
    api.jobScripts.set(job.id, api.nextJobScript);
    api.nextJobScript = [];
    return reply(202, { jobId: job.id });
  };

  const catalog = (
    method: string,
    path: string,
    search: URLSearchParams,
    body: Record<string, unknown>,
  ) => {
    const parts = path.split('/').filter(Boolean);
    const route = `${method} /${parts
      .map((part, index) =>
        index > 0 &&
        ![
          'recent',
          'stats',
          'tags',
          'chapters',
          'status',
          'favorite',
          'url',
          'epub',
          'fetch',
          'read',
          'update-check',
          'fetch-all',
          'cover',
          'new-chapters-count',
          'preferences',
          'novels',
          'by-novel',
          'profile',
          'password',
          'account',
        ].includes(part)
          ? ':id'
          : part,
      )
      .join('/')}`;
    const id = parts[1] ?? '';

    switch (route) {
      case 'GET /sources':
        return reply(200, { sources: SOURCES });
      case 'GET /sources/:id/account':
        return reply(200, {
          signInUrl: 'https://wtr-lab.com/en/auth/login',
          signedIn: api.wtrLabSignedIn,
        });
      case 'POST /import/url':
        return importUrl(body.url);
      case 'POST /import/epub':
        return importEpub(body.file);
      case 'GET /import/recent':
        return reply(200, { jobs: [...api.jobs.values()].reverse() });
      case 'GET /jobs/:id': {
        const job = api.jobs.get(id);
        if (!job) return notFound('Job not found.');
        const response = reply(200, { job });
        // The worker moves on before the next poll.
        const next = api.jobScripts.get(id)?.shift();
        if (next) api.jobs.set(id, { ...job, ...next });
        return response;
      }
      case 'PATCH /novels/:id':
      case 'POST /novels/:id/cover':
      case 'DELETE /novels/:id':
        return manage(method, route, id, body);
      case 'GET /novels/:id': {
        const entry = api.novels.get(id);
        if (!entry) return notFound('Novel not found.');
        return reply(200, { novel: { ...entry.novel, library: api.library.get(id) ?? null } });
      }
      case 'GET /novels/:id/chapters': {
        const entry = api.novels.get(id);
        if (!entry) return notFound('Novel not found.');
        const page = Number(search.get('page') ?? 1);
        const limit = Number(search.get('limit') ?? 50);
        const order = search.get('order') === 'desc' ? 'desc' : 'asc';
        const q = (search.get('q') ?? '').toLowerCase();
        let chapters = entry.chapters.filter(
          (chapter) =>
            !q || chapter.title.toLowerCase().includes(q) || String(chapter.number) === q,
        );
        if (order === 'desc') chapters = [...chapters].reverse();
        return reply(200, {
          chapters: chapters.slice((page - 1) * limit, page * limit),
          page,
          limit,
          order,
          total: chapters.length,
        });
      }
      case 'GET /library': {
        const page = Number(search.get('page') ?? 1);
        const limit = Number(search.get('limit') ?? 24);
        const sort = (search.get('sort') ?? 'last_read') as LibrarySort;
        const status = search.get('status');
        const source = search.get('source');
        const favorite = search.get('favorite');
        const unread = search.get('unread');
        const tag = search.get('tag')?.toLowerCase() ?? null;
        const q = search.get('q') ?? '';
        const items = [...api.library.keys()]
          .map((novelId) => item(novelId))
          .filter((entry): entry is LibraryItem => entry !== null)
          .filter(
            ({ novel, library }) =>
              (status === null || library.status === status) &&
              (source === null || novel.source.key === source) &&
              (favorite === null || library.isFavorite === (favorite === 'true')) &&
              (unread === null || library.newChapterCount > 0 === (unread === 'true')) &&
              (tag === null || novelTags(novel.id).some((t) => t.toLowerCase() === tag)) &&
              matchesWords(novel, q),
          )
          .sort((a, b) => LIBRARY_ORDER[sort](a, b) || byTitle(a, b));
        return reply(200, {
          items: items.slice((page - 1) * limit, page * limit),
          page,
          limit,
          sort,
          total: items.length,
        });
      }
      case 'GET /search': {
        const q = (search.get('q') ?? '').trim();
        if (q.length < 2) return bad('Type at least 2 characters to search.');
        const text = q.toLowerCase();
        const rank = ({ novel }: SearchItem) => {
          const title = novel.title.toLowerCase();
          if (title === text) return 0;
          if (title.startsWith(text)) return 1;
          return title.includes(text) ? 2 : 3;
        };
        const matches = catalogItems(q).sort((a, b) => rank(a) - rank(b) || byTitle(a, b));
        return reply(200, {
          results: matches.slice(0, Number(search.get('limit') ?? 5)).map((match) => ({
            novel: summary(match.novel),
            inLibrary: match.inLibrary,
          })),
          total: matches.length,
        });
      }
      case 'GET /library/new-chapters-count':
        return reply(200, {
          count: [...api.library.values()].reduce((sum, entry) => sum + entry.newChapterCount, 0),
        });
      case 'POST /novels/:id/update-check':
      case 'GET /novels/:id/update-check':
        return updateCheck(method, id);
      case 'POST /novels/:id/fetch-all':
      case 'GET /novels/:id/fetch-all':
      case 'DELETE /novels/:id/fetch-all':
        return fullFetch(method, id);
      case 'GET /novels/:id/epub':
        return epub(id);
      case 'GET /exports':
        // Every fetch here counts as the reader's own; the latest first.
        return reply(200, {
          items: [...api.fullFetches]
            .sort(([, a], [, b]) => b.createdAt.localeCompare(a.createdAt))
            .flatMap(([novelId]) => {
              const entry = api.novels.get(novelId);
              return entry ? [{ novel: summary(entry.novel), ...fullFetchResponse(novelId) }] : [];
            }),
        });
      case 'GET /update-jobs': {
        const page = Number(search.get('page') ?? 1);
        const limit = Number(search.get('limit') ?? 20);
        return reply(200, {
          items: api.updateRuns.slice((page - 1) * limit, page * limit),
          page,
          limit,
          total: api.updateRuns.length,
        });
      }
      case 'GET /library/tags': {
        const counts = new Map<string, { tag: string; novels: number }>();
        for (const id of api.library.keys()) {
          for (const tag of novelTags(id)) {
            const known = counts.get(tag.toLowerCase());
            if (known) known.novels += 1;
            else counts.set(tag.toLowerCase(), { tag, novels: 1 });
          }
        }
        return reply(200, {
          tags: [...counts.values()].sort((a, b) => a.tag.localeCompare(b.tag)),
        });
      }
      case 'GET /library/stats': {
        const entries = [...api.library.values()];
        const byStatus = Object.fromEntries(
          LIBRARY_STATUSES.map((status) => [
            status,
            entries.filter((entry) => entry.status === status).length,
          ]),
        );
        return reply(200, {
          total: entries.length,
          byStatus,
          favorites: entries.filter((entry) => entry.isFavorite).length,
          newChapters: entries.reduce((sum, entry) => sum + entry.newChapterCount, 0),
          novelsWithNewChapters: entries.filter((entry) => entry.newChapterCount > 0).length,
          lastCheckedAt: entries.length > 0 ? '2026-09-26T10:00:00.000Z' : null,
        });
      }
      case 'DELETE /library/:id':
        if (!api.library.delete(id)) return notFound("This novel isn't in your library.");
        api.novels.delete(id);
        return reply(200, null);
      case 'PATCH /library/:id/status':
      case 'PATCH /library/:id/favorite': {
        const entry = api.library.get(id);
        if (!entry) return notFound("This novel isn't in your library.");
        if (route.endsWith('status')) entry.status = body.status as LibraryStatus;
        else entry.isFavorite = body.isFavorite === true;
        return reply(200, { item: item(id) });
      }
      case 'GET /history':
      case 'GET /history/stats':
      case 'GET /history/novels':
      case 'GET /history/by-novel':
        return history(route, search);
      case 'GET /user/profile':
        return reply(200, { profile: api.profile ?? emptyProfile() });
      case 'GET /user/preferences':
        return reply(200, { preferences: api.preferences });
      case 'PATCH /user/preferences': {
        api.preferenceSaves.push(body);
        if (api.preferenceSaveError) return bad(api.preferenceSaveError);
        const unknown = Object.keys(body).filter(
          (key) => !(EDITABLE_PREFERENCES as readonly string[]).includes(key),
        );
        if (unknown.length > 0) return bad(`Unknown preference: ${unknown.join(', ')}.`);
        api.preferences = { ...api.preferences, ...body };
        return reply(200, { preferences: api.preferences });
      }
      case 'GET /reader/:id/chapters/:id':
      case 'POST /reader/:id/chapters/:id/fetch':
      case 'POST /reader/:id/chapters/:id/read':
        return reader(route, id, parts[3] ?? '');
      default:
        return notFound();
    }
  };

  /** A novel's manual update check. */
  const updateCheck = (method: string, novelId: string) => {
    const entry = api.novels.get(novelId);
    if (!entry) return notFound('Novel not found.');
    const current = api.updateChecks.get(novelId) ?? null;
    const active = current !== null && !isJobFinished(current.status);

    if (method === 'POST') {
      if (entry.novel.source.key === 'epub') {
        return reply(409, null, 'EPUB novels have no source site to check for new chapters.');
      }
      if (current && active) return reply(202, { check: current });
      counter += 1;
      const check: UpdateRun = {
        id: `run-${counter}`,
        trigger: 'manual',
        status: 'pending',
        novel: { id: novelId, title: entry.novel.title },
        novelsChecked: 0,
        newChaptersFound: 0,
        errors: [],
        progressMessage: 'Waiting to start…',
        progressPercent: null,
        error: null,
        createdAt: new Date().toISOString(),
        startedAt: null,
        finishedAt: null,
      };
      api.updateChecks.set(novelId, check);
      return reply(202, { check });
    }

    // GET: answers with the check as it is, then the worker moves on before the next poll.
    const response = reply(200, { check: current });
    const next = active ? api.checkScript.shift() : undefined;
    if (current && next) {
      const moved = { ...current, ...next };
      api.updateChecks.set(novelId, moved);
      if (isJobFinished(moved.status)) entry.novel.lastCheckedAt = new Date().toISOString();
      if (moved.status === 'completed') {
        entry.novel.updateFailure = null;
        addNewChapters(novelId, moved.newChaptersFound);
      }
      const [failure] = moved.errors;
      if (moved.status === 'failed' && failure) {
        entry.novel.updateFailure = { type: failure.type, message: failure.message };
      }
    }
    return response;
  };

  /** A novel's latest whole-novel fetch and its stored chapters, as the API answers. */
  const fullFetchResponse = (novelId: string) => {
    const chapters = api.novels.get(novelId)?.chapters ?? [];
    return {
      fetch: api.fullFetches.get(novelId) ?? null,
      storedChapters: chapters.filter((chapter) => chapter.isFetched).length,
      totalChapters: chapters.length,
    };
  };

  /** "Fetch all chapters" of a novel. */
  const fullFetch = (method: string, novelId: string) => {
    const entry = api.novels.get(novelId);
    if (!entry) return notFound('Novel not found.');
    const current = api.fullFetches.get(novelId) ?? null;
    const active = current !== null && !isJobFinished(current.status);
    const body = () => fullFetchResponse(novelId);
    const store = (count: number) => {
      for (const chapter of entry.chapters.filter((c) => !c.isFetched).slice(0, count)) {
        chapter.isFetched = true;
      }
    };

    if (method === 'POST') {
      if (entry.novel.source.key === 'epub') {
        return reply(409, null, 'EPUB novels have every chapter stored already.');
      }
      if (active) return reply(202, body());
      if (entry.chapters.every((chapter) => chapter.isFetched)) {
        return reply(409, null, 'Every chapter of this novel is stored already.');
      }
      counter += 1;
      api.fullFetches.set(novelId, {
        id: `fetch-all-${counter}`,
        status: 'pending',
        progressMessage: 'Waiting to start…',
        progressPercent: null,
        queuedBehind: 0,
        error: null,
        canCancel: true,
        result: null,
        createdAt: new Date().toISOString(),
        startedAt: null,
        finishedAt: null,
      });
      return reply(202, body());
    }
    if (method === 'DELETE') {
      if (!current || !active) return reply(409, null, "This novel isn't being fetched.");
      api.fullFetches.delete(novelId);
      return reply(200, body());
    }

    // GET: answers with the fetch as it is, then the worker moves on before the next poll.
    const response = reply(200, body());
    const next = active ? api.fullFetchScript.shift() : undefined;
    if (current && next) {
      const { stored = 0, ...change } = next;
      store(change.status === 'completed' ? entry.chapters.length : stored);
      api.fullFetches.set(novelId, { ...current, ...change });
    }
    return response;
  };

  /** GET /novels/:id/epub: a stand-in file for the stored chapters. */
  const epub = (novelId: string) => {
    const entry = api.novels.get(novelId);
    if (!entry) return notFound('Novel not found.');
    const stored = entry.chapters.filter((chapter) => chapter.isFetched).length;
    if (stored === 0) {
      return reply(
        409,
        null,
        'No chapter of this novel is stored yet. Fetch its chapters first, then export it.',
      );
    }
    return new Response(`EPUB of ${entry.novel.title}: ${stored} chapters`, {
      status: 200,
      headers: { 'Content-Type': 'application/epub+zip' },
    });
  };

  /** What an update check stores: chapters after the last one, NEW for the reader. */
  const addNewChapters = (novelId: string, count: number) => {
    const entry = api.novels.get(novelId);
    if (!entry || count === 0) return;
    for (let index = 0; index < count; index += 1) {
      const number = entry.chapters.length + 1;
      entry.chapters.push({
        id: `${novelId}-c${number}`,
        number,
        title: `Chapter ${number}: Part ${number}`,
        publishedAt: new Date().toISOString(),
        isFetched: false,
        fetchFailure: null,
        isRead: false,
        isNew: true,
      });
    }
    entry.novel.totalChapters = entry.chapters.length;
    const library = api.library.get(novelId);
    if (library) library.newChapterCount += count;
  };

  /** /reader: a chapter is fetched over `fetchPolls` polls. */
  const reader = (route: string, novelId: string, numberText: string) => {
    const number = /^\d{1,9}$/.test(numberText) ? Number(numberText) : 0;
    if (number < 1) return bad('Chapter numbers are whole numbers, starting at 1.');
    const entry = api.novels.get(novelId);
    if (!entry) return notFound('Novel not found.');
    const chapter = entry.chapters.find((candidate) => candidate.number === number);
    if (!chapter) {
      return reply(
        404,
        { totalChapters: entry.novel.totalChapters },
        'This novel has no chapter with that number.',
      );
    }
    const startFetch = () => {
      const existing = api.fetches.get(chapter.id);
      if (existing) return existing.jobId;
      counter += 1;
      const jobId = `job-${counter}`;
      api.fetches.set(chapter.id, { jobId, polls: api.fetchPolls });
      return jobId;
    };

    if (route.endsWith('/fetch')) {
      if (chapter.isFetched) return reply(200, { jobId: null });
      return reply(202, { jobId: startFetch() });
    }

    if (route.endsWith('/read')) {
      if (!chapter.isFetched) {
        return reply(
          409,
          null,
          "This chapter hasn't been downloaded yet, so it can't be marked as read.",
        );
      }
      api.reads.push(`${novelId}/${number}`);
      chapter.isRead = true;
      chapter.isNew = false;
      const library = api.library.get(novelId);
      if (library) {
        library.lastReadChapterNumber = number;
        library.furthestChapterNumber = Math.max(library.furthestChapterNumber ?? 0, number);
        library.lastReadAt = new Date().toISOString();
        library.newChapterCount = entry.chapters.filter((each) => each.isNew).length;
      }
      return reply(200, { library: library ?? null });
    }

    // GET: the worker makes progress between polls.
    const fetch = api.fetches.get(chapter.id);
    if (fetch && fetch.polls <= 0) {
      api.fetches.delete(chapter.id);
      if (api.fetchOutcome === 'ready') {
        chapter.isFetched = true;
        chapter.fetchFailure = null;
        api.contents.set(chapter.id, chapterText(number));
      } else {
        chapter.fetchFailure = {
          type: 'network_error',
          message: "We couldn't reach Royal Road after several attempts. Please try again later.",
        };
      }
    }

    const index = entry.chapters.indexOf(chapter);
    const link = (other: ChapterSummary | undefined) =>
      other ? { number: other.number, title: other.title } : null;
    const view = {
      novel: {
        id: novelId,
        title: entry.novel.title,
        author: entry.novel.author,
        source: entry.novel.source,
        totalChapters: entry.novel.totalChapters,
      },
      chapter: {
        id: chapter.id,
        number,
        title: chapter.title,
        publishedAt: chapter.publishedAt,
      },
      navigation: {
        previous: link(entry.chapters[index - 1]),
        next: link(entry.chapters[index + 1]),
      },
      library: api.library.get(novelId) ?? null,
    };

    const content = api.contents.get(chapter.id);
    let body: ReaderChapterResponse;
    if (chapter.isFetched && content !== undefined) {
      body = {
        ...view,
        status: 'ready',
        content,
        wordCount: content.split(/\s+/).length,
        preferences: { ...api.preferences },
      };
    } else if (chapter.fetchFailure && !api.fetches.has(chapter.id)) {
      body = { ...view, status: 'failed', error: chapter.fetchFailure };
    } else {
      const jobId = startFetch();
      const active = api.fetches.get(chapter.id);
      if (active) active.polls -= 1;
      body = {
        ...view,
        status: 'fetching',
        jobId,
        job: { id: jobId, status: 'pending', progressMessage: 'Waiting to start…', error: null },
      };
    }
    return reply(body.status === 'fetching' ? 202 : 200, body);
  };

  setDispatch(async (request) => {
    const url = new URL(request.path, 'http://app.test');
    const path = url.pathname;
    api.calls.push(`${request.method} ${path}${url.search}`);
    if (api.unreachable) throw new TypeError('Failed to fetch');
    const upload = request.file
      ? new File([request.file.bytes as Uint8Array<ArrayBuffer>], request.file.name, {
          type: request.file.type,
        })
      : null;
    if (upload && api.uploadGate) await api.uploadGate;
    const body = (upload ? { file: upload, cover: upload } : (request.body ?? {})) as Record<
      string,
      unknown
    >;
    if (api.preferencesGate && request.method === 'GET' && path === '/user/preferences') {
      await api.preferencesGate;
    }
    const answer = catalog(request.method, path, url.searchParams, body);
    if (answer.headers.get('Content-Type')?.includes('application/json')) {
      return { status: answer.status, body: await answer.json() };
    }
    return {
      status: answer.status,
      file: {
        mediaType: answer.headers.get('Content-Type') ?? '',
        name: null,
        bytes: new Uint8Array(await answer.arrayBuffer()),
      },
    };
  });
  return api;
}

let readCounter = 0;

/**
 * Records a read for /history: chapter `chapter` of a fake novel, `daysAgo` UTC days back
 * at `time`, newest first as the API sorts them (call from the oldest to the newest).
 */
export function addRead(
  api: FakeApi,
  novelId: string,
  chapter: number,
  when: { daysAgo: number; time?: string },
) {
  const entry = api.novels.get(novelId);
  if (!entry) throw new Error(`addRead: no novel ${novelId}`);
  readCounter += 1;
  const day = new Date(Date.now() - when.daysAgo * 86_400_000).toISOString().slice(0, 10);
  const readAt = `${day}T${when.time ?? '12:00'}:00.000Z`;
  const { novel } = entry;
  api.history.unshift({
    id: String(readCounter),
    readAt,
    date: day,
    novel: { id: novel.id, title: novel.title, author: novel.author, coverUrl: novel.coverUrl },
    chapter: { number: chapter, title: `Chapter ${chapter}: Part ${chapter}` },
  });
}
