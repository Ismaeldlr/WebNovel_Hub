import {
  CHAPTER_ORDERS,
  CHAPTER_PAGE_LIMITS,
  CONTENT_WIDTHS,
  COVER_UPLOAD,
  DEFAULT_LIBRARY_SORT,
  EPUB_MAX_BYTES,
  HISTORY_BY_NOVEL_LIMITS,
  HISTORY_LIMITS,
  HISTORY_NOVELS_LIMITS,
  HISTORY_RANGES,
  LIBRARY_PAGE_LIMITS,
  LIBRARY_SORTS,
  LIBRARY_STATUSES,
  NOVEL_DETAIL_LIMITS,
  READER_FONT_FAMILIES,
  READER_PREFERENCE_LIMITS,
  RECENT_IMPORTS_LIMITS,
  SEARCH_LIMITS,
  SOURCE_KEY_PATTERN,
  TERM_TEXT_MAX,
  THEME_PREFERENCES,
  UPDATE_RUN_PAGE_LIMITS,
} from '@webnovel-hub/shared';
import { z } from 'zod';
import type { Queryable } from '../db/database.js';
import { AppError } from '../errors.js';
import { findCover } from '../repositories/covers.js';
import { parseCursor } from '../repositories/history.js';
import { listSources } from '../repositories/sources.js';
import type { AccountService } from '../services/accounts.js';
import { CATALOG_MESSAGES, type CatalogService } from '../services/catalog.js';
import type { EpubExportService } from '../services/epub-export.js';
import type { EpubImportService } from '../services/epub-import.js';
import type { FullFetchService } from '../services/full-fetch.js';
import type { HistoryService } from '../services/history.js';
import type { ImportService } from '../services/imports.js';
import type { LibraryService } from '../services/library.js';
import { MANAGEMENT_MESSAGES, type NovelManagementService } from '../services/novel-management.js';
import type { PreferencesService } from '../services/preferences.js';
import { READER_MESSAGES, type ReaderService } from '../services/reader.js';
import { TERM_MESSAGES, type TermService } from '../services/terms.js';
import type { UpdateService } from '../services/updates.js';
import { type Route, type RouteRequest, type UploadedFile, ok } from './router.js';
import {
  booleanFlag,
  idParam,
  nullableId,
  optionalId,
  parseBody,
  parseQuery,
  positiveInt,
  searchText,
} from './validation.js';

export interface Services {
  db: Queryable;
  catalog: CatalogService;
  library: LibraryService;
  reader: ReaderService;
  history: HistoryService;
  preferences: PreferencesService;
  imports: ImportService;
  epubImports: EpubImportService;
  epubExport: EpubExportService;
  fullFetch: FullFetchService;
  updates: UpdateService;
  management: NovelManagementService;
  accounts: AccountService;
  terms: TermService;
}

const page = positiveInt('page must be a whole number of 1 or more.', { max: 1_000_000 });
const limit = (max: number) =>
  positiveInt(`limit must be a whole number from 1 to ${max}.`, { max });

const novelId = (request: RouteRequest, name = 'id') =>
  idParam(request.params[name], CATALOG_MESSAGES.novelNotFound);

// --- Library -------------------------------------------------------------------------------

const STATUS_MESSAGE = 'Choose a status: Reading, Following, On hold, Dropped or Completed.';
const SOURCE_FILTER_MESSAGE = 'source must be a source key, such as royal_road.';

const libraryQuery = z.object({
  page,
  limit: limit(LIBRARY_PAGE_LIMITS.max),
  status: z
    .enum(LIBRARY_STATUSES, { error: `status must be one of ${LIBRARY_STATUSES.join(', ')}.` })
    .optional(),
  // Any well-formed key is accepted; an unknown one matches nothing.
  source: z
    .string({ error: SOURCE_FILTER_MESSAGE })
    .regex(SOURCE_KEY_PATTERN, SOURCE_FILTER_MESSAGE)
    .optional(),
  favorite: booleanFlag('favorite'),
  unread: booleanFlag('unread'),
  tag: searchText('tag'),
  sort: z
    .enum(LIBRARY_SORTS, { error: `sort must be one of ${LIBRARY_SORTS.join(', ')}.` })
    .optional(),
  q: searchText('q'),
});

const statusBody = z.object(
  { status: z.enum(LIBRARY_STATUSES, { error: STATUS_MESSAGE }) },
  { error: STATUS_MESSAGE },
);

const favoriteBody = z.object(
  { isFavorite: z.boolean({ error: 'isFavorite must be true or false.' }) },
  { error: 'isFavorite must be true or false.' },
);

// --- Novels ----------------------------------------------------------------------------------

const chapterQuery = z.object({
  page,
  limit: limit(CHAPTER_PAGE_LIMITS.max),
  order: z.enum(CHAPTER_ORDERS, { error: 'order must be asc or desc.' }).optional(),
  q: searchText('q'),
});

const optionalText = (max: number, tooLong: string) =>
  z
    .string({ error: 'Details must be text.' })
    .max(max, tooLong)
    .nullable()
    .optional()
    .transform((text) => {
      if (text === undefined) return undefined;
      const trimmed = text?.replace(/\r\n?/g, '\n').trim() ?? '';
      return trimmed === '' ? null : trimmed;
    });

const LIMITS = NOVEL_DETAIL_LIMITS;

/** A novel's details and nothing else. Unknown fields, such as chapter text, are refused. */
export const detailsBody = z
  .strictObject(
    {
      title: z
        .string({ error: 'The title must be text.' })
        .trim()
        .min(1, 'Enter a title.')
        .max(LIMITS.title, `Titles are at most ${LIMITS.title} characters.`)
        .optional(),
      author: optionalText(LIMITS.author, `Author names are at most ${LIMITS.author} characters.`),
      description: optionalText(
        LIMITS.description,
        `Descriptions are at most ${LIMITS.description.toLocaleString('en-US')} characters.`,
      ),
      tags: z
        .array(
          z
            .string({ error: 'Each tag must be text.' })
            .trim()
            .min(1, 'Tags cannot be empty.')
            .max(LIMITS.tag, `Tags are at most ${LIMITS.tag} characters.`),
          { error: 'tags must be a list of tags.' },
        )
        .max(LIMITS.tags, `A novel has at most ${LIMITS.tags} tags.`)
        .optional()
        // The first spelling of each tag, ignoring case.
        .transform((tags) =>
          tags?.filter(
            (tag, index) =>
              tags.findIndex((other) => other.toLowerCase() === tag.toLowerCase()) === index,
          ),
        ),
    },
    {
      error: (issue) =>
        issue.code === 'unrecognized_keys'
          ? `Only the title, author, description and tags can be changed (not: ${issue.keys.join(', ')}).`
          : 'Send the details to change as a JSON object.',
    },
  )
  .refine((changes) => Object.values(changes).some((value) => value !== undefined), {
    error: 'Change at least one of the title, author, description or tags.',
  });

// --- Terms ---------------------------------------------------------------------------------

const termFields = {
  novelId: nullableId('novelId must be a novel id, or null for every novel.'),
  original: z
    .string({ error: 'The original text must be text.' })
    .trim()
    .min(1, 'Enter the text to replace.')
    .max(TERM_TEXT_MAX, `A term's text is at most ${TERM_TEXT_MAX} characters.`),
  replacement: z
    .string({ error: 'The replacement must be text.' })
    .trim()
    .max(TERM_TEXT_MAX, `A replacement is at most ${TERM_TEXT_MAX} characters.`),
};

const termCreateBody = z.strictObject(termFields, {
  error: (issue) =>
    issue.code === 'unrecognized_keys'
      ? `A term has only a novelId, an original and a replacement (not: ${issue.keys.join(', ')}).`
      : 'Send the term as a JSON object.',
});

const termUpdateBody = z
  .strictObject(
    {
      novelId: termFields.novelId.optional(),
      original: termFields.original.optional(),
      replacement: termFields.replacement.optional(),
    },
    {
      error: (issue) =>
        issue.code === 'unrecognized_keys'
          ? `Only the novel, the original and the replacement can be changed (not: ${issue.keys.join(', ')}).`
          : 'Send the changes as a JSON object.',
    },
  )
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    error: 'Change at least one of the novel, the original or the replacement.',
  });

const termId = (request: RouteRequest) => idParam(request.params.id, TERM_MESSAGES.notFound);

export const COVER_MESSAGES = {
  missing: 'Choose an image for the cover.',
  tooLarge: 'This image is larger than 8 MB, the most a cover can be.',
} as const;

function coverUpload(file: UploadedFile | null): Uint8Array {
  if (!file) throw new AppError(400, COVER_MESSAGES.missing);
  if (file.bytes.length > COVER_UPLOAD.maxBytes) throw new AppError(413, COVER_MESSAGES.tooLarge);
  const extension = file.name.toLowerCase().split('.').pop() ?? '';
  const known =
    (COVER_UPLOAD.extensions as readonly string[]).includes(extension) &&
    (file.type === '' ||
      (COVER_UPLOAD.mediaTypes as readonly string[]).includes(file.type.toLowerCase()));
  if (!known) throw new AppError(400, MANAGEMENT_MESSAGES.coverType);
  return file.bytes;
}

// --- Imports ---------------------------------------------------------------------------------

const ENTER_URL = "Paste the address of the novel's page.";

const PASTE_LINK = "Paste the link from the site's sign-in email.";
const signInLinkBody = z.object(
  { link: z.string({ error: PASTE_LINK }).trim().min(1, PASTE_LINK).max(4_096, PASTE_LINK) },
  { error: PASTE_LINK },
);

const importUrlBody = z.object(
  {
    url: z
      .string({ error: ENTER_URL })
      .trim()
      .min(1, ENTER_URL)
      .max(2_048, 'That address is too long.'),
  },
  { error: ENTER_URL },
);

export const UPLOAD_MESSAGES = {
  noFile: 'Choose an EPUB file to import.',
  notEpub: 'Choose an EPUB file: its name ends in .epub.',
  wrongType: "This file isn't an EPUB.",
  notZip: "This file isn't a valid EPUB: it isn't a ZIP archive.",
  tooLarge: 'This file is larger than 50 MB, the most an EPUB can be.',
} as const;

// What file pickers call an .epub: its own type, a ZIP type, or nothing they know.
const EPUB_MEDIA_TYPES = new Set([
  'application/epub+zip',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
  '',
]);
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04]; // a local file header, "PK" 3 4

function epubUpload(file: UploadedFile | null): UploadedFile {
  if (!file) throw new AppError(400, UPLOAD_MESSAGES.noFile);
  if (file.bytes.length > EPUB_MAX_BYTES) throw new AppError(413, UPLOAD_MESSAGES.tooLarge);
  if (!/\.epub$/i.test(file.name)) throw new AppError(400, UPLOAD_MESSAGES.notEpub);
  if (!EPUB_MEDIA_TYPES.has(file.type.toLowerCase())) {
    throw new AppError(400, UPLOAD_MESSAGES.wrongType);
  }
  if (!ZIP_SIGNATURE.every((byte, index) => file.bytes[index] === byte)) {
    throw new AppError(400, UPLOAD_MESSAGES.notZip);
  }
  return file;
}

// --- History ---------------------------------------------------------------------------------

export const HISTORY_MESSAGES = {
  range: 'range must be all, 7d or 30d.',
  novelId: 'novelId must be a novel id.',
  cursor: "That page of history can't be found. Reload the history and try again.",
} as const;

const range = z.enum(HISTORY_RANGES, { error: HISTORY_MESSAGES.range }).optional();

const historyQuery = z.object({
  range,
  novelId: optionalId(HISTORY_MESSAGES.novelId),
  cursor: z.string({ error: HISTORY_MESSAGES.cursor }).optional(),
  limit: limit(HISTORY_LIMITS.max),
});
const historyStatsQuery = z.object({ range, novelId: optionalId(HISTORY_MESSAGES.novelId) });
const historyNovelsQuery = z.object({
  q: searchText('q'),
  limit: limit(HISTORY_NOVELS_LIMITS.max),
});
const historyByNovelQuery = z.object({ range, page, limit: limit(HISTORY_BY_NOVEL_LIMITS.max) });

// --- Reader ----------------------------------------------------------------------------------

/** `:number`: a chapter's 1..N position; anything else is a 400. */
function chapterNumber(value: string | undefined): number {
  const number = value !== undefined && /^\d{1,9}$/.test(value) ? Number(value) : 0;
  if (number < 1) throw new AppError(400, READER_MESSAGES.invalidChapter);
  return number;
}

// --- Preferences -----------------------------------------------------------------------------

const { fontSize, fontSizeCompact, lineSpacing, prefetchCount } = READER_PREFERENCE_LIMITS;
const FONT_SIZE_MESSAGE = `The font size must be a whole number of pixels from ${fontSize.min} to ${fontSize.max}.`;
const FONT_SIZE_COMPACT_MESSAGE = `The font size on phones must be a whole number of pixels from ${fontSizeCompact.min} to ${fontSizeCompact.max}.`;
const LINE_SPACING_MESSAGE = `The line spacing must be from ${lineSpacing.min} to ${lineSpacing.max}, in steps of ${lineSpacing.step}.`;
const PREFETCH_MESSAGE = `Chapters to download ahead must be a whole number from ${prefetchCount.min} to ${prefetchCount.max}.`;

/** A whole number within `limits`, with one message for every way it can be wrong. */
const wholeNumber = (limits: { min: number; max: number }, message: string) =>
  z.number({ error: message }).int(message).min(limits.min, message).max(limits.max, message);

/** Whether `value` is a whole number of tenths (1.6, not 1.65), allowing for binary fractions. */
const isTenths = (value: number) => Math.abs(value * 10 - Math.round(value * 10)) < 1e-9;

// Any of the editable preferences, at least one. Unknown names are refused rather than
// ignored, so a misspelt one doesn't look saved.
const preferencesBody = z
  .strictObject(
    {
      theme: z
        .enum(THEME_PREFERENCES, {
          error: 'The theme must be light, dark, sepia, black or system.',
        })
        .optional(),
      fontSize: wholeNumber(fontSize, FONT_SIZE_MESSAGE).optional(),
      fontSizeCompact: wholeNumber(fontSizeCompact, FONT_SIZE_COMPACT_MESSAGE).optional(),
      lineSpacing: z
        .number({ error: LINE_SPACING_MESSAGE })
        .min(lineSpacing.min, LINE_SPACING_MESSAGE)
        .max(lineSpacing.max, LINE_SPACING_MESSAGE)
        .refine(isTenths, LINE_SPACING_MESSAGE)
        .transform((value) => Math.round(value * 10) / 10)
        .optional(),
      contentWidth: z
        .enum(CONTENT_WIDTHS, { error: 'The width must be narrow, medium or wide.' })
        .optional(),
      fontFamily: z
        .enum(READER_FONT_FAMILIES, {
          error: 'The font must be serif, sans, hyperlegible or system.',
        })
        .optional(),
      prefetchCount: wholeNumber(prefetchCount, PREFETCH_MESSAGE).optional(),
      backgroundFetching: z
        .boolean({ error: 'Background fetching is on (true) or off (false).' })
        .optional(),
      wifiOnly: z.boolean({ error: 'Wi-Fi only is on (true) or off (false).' }).optional(),
      notifyNewChapters: z
        .boolean({ error: 'New-chapter notifications are on (true) or off (false).' })
        .optional(),
      wtrLabMachineTranslation: z
        .boolean({ error: 'WTR Lab machine translation is on (true) or off (false).' })
        .optional(),
    },
    {
      error: (issue) =>
        issue.code === 'unrecognized_keys'
          ? `Unknown ${issue.keys.length === 1 ? 'preference' : 'preferences'}: ${issue.keys.join(', ')}.`
          : 'Send the preferences to change as a JSON object.',
    },
  )
  .refine(
    (changes) => Object.values(changes).some((value) => value !== undefined),
    'Send at least one preference to change.',
  );

// --- Search and lists ------------------------------------------------------------------------

const TOO_SHORT = `Type at least ${SEARCH_LIMITS.minLength} characters to search.`;
const searchQuery = z.object({
  q: z
    .string({ error: TOO_SHORT })
    .trim()
    .min(SEARCH_LIMITS.minLength, TOO_SHORT)
    .max(200, 'The search is too long.'),
  limit: limit(SEARCH_LIMITS.max),
});

const recentImportsQuery = z.object({ limit: limit(RECENT_IMPORTS_LIMITS.max) });
const updateRunsQuery = z.object({ page, limit: limit(UPDATE_RUN_PAGE_LIMITS.max) });

/** Collects a file produced in pieces. */
async function collect(chunks: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of chunks) {
    parts.push(chunk);
    length += chunk.length;
  }
  const bytes = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }
  return bytes;
}

/** Every route of the app, with the paths and statuses the REST API had. */
export function createRoutes(s: Services): Route[] {
  return [
    // Library
    {
      method: 'GET',
      path: '/library',
      async handle({ query }) {
        const q = parseQuery(libraryQuery, query);
        return ok(
          await s.library.list({
            status: q.status ?? null,
            source: q.source ?? null,
            favorite: q.favorite ?? null,
            unread: q.unread ?? null,
            tag: q.tag,
            q: q.q,
            sort: q.sort ?? DEFAULT_LIBRARY_SORT,
            page: q.page ?? 1,
            limit: q.limit ?? LIBRARY_PAGE_LIMITS.default,
          }),
        );
      },
    },
    { method: 'GET', path: '/library/stats', handle: async () => ok(await s.library.stats()) },
    {
      method: 'GET',
      path: '/library/tags',
      handle: async () => ok({ tags: await s.library.tags() }),
    },
    {
      method: 'GET',
      path: '/library/new-chapters-count',
      handle: async () => ok({ count: await s.library.newChaptersCount() }),
    },
    {
      method: 'DELETE',
      path: '/library/:id',
      async handle(request) {
        await s.library.remove(novelId(request));
        return ok(null);
      },
    },
    {
      method: 'PATCH',
      path: '/library/:id/status',
      async handle(request) {
        const { status } = parseBody(statusBody, request.body);
        return ok({ item: await s.library.setStatus(novelId(request), status) });
      },
    },
    {
      method: 'PATCH',
      path: '/library/:id/favorite',
      async handle(request) {
        const { isFavorite } = parseBody(favoriteBody, request.body);
        return ok({ item: await s.library.setFavorite(novelId(request), isFavorite) });
      },
    },

    // Novels
    {
      method: 'GET',
      path: '/novels/:id',
      handle: async (request) => ok({ novel: await s.catalog.getNovel(novelId(request)) }),
    },
    {
      method: 'PATCH',
      path: '/novels/:id',
      async handle(request) {
        const changes = parseBody(detailsBody, request.body);
        return ok({ novel: await s.management.updateDetails(novelId(request), changes) });
      },
    },
    {
      method: 'POST',
      path: '/novels/:id/cover',
      async handle(request) {
        const id = novelId(request);
        return ok({ novel: await s.management.replaceCover(id, coverUpload(request.file)) });
      },
    },
    {
      method: 'DELETE',
      path: '/novels/:id',
      async handle(request) {
        await s.management.deleteNovel(novelId(request));
        return ok(null);
      },
    },
    {
      method: 'GET',
      path: '/novels/:id/terms',
      handle: async (request) => ok({ terms: await s.terms.listForNovel(novelId(request)) }),
    },
    {
      method: 'GET',
      path: '/novels/:id/chapters',
      async handle(request) {
        const q = parseQuery(chapterQuery, request.query);
        return ok(
          await s.catalog.listChapters(novelId(request), {
            page: q.page ?? 1,
            limit: q.limit ?? CHAPTER_PAGE_LIMITS.default,
            order: q.order ?? 'asc',
            q: q.q,
          }),
        );
      },
    },
    {
      method: 'POST',
      path: '/novels/:id/update-check',
      handle: async (request) => ok({ check: await s.updates.checkNovel(novelId(request)) }, 202),
    },
    {
      method: 'GET',
      path: '/novels/:id/update-check',
      handle: async (request) => ok({ check: await s.updates.latestCheck(novelId(request)) }),
    },
    {
      method: 'POST',
      path: '/novels/:id/fetch-all',
      handle: async (request) => ok(await s.fullFetch.start(novelId(request)), 202),
    },
    {
      method: 'GET',
      path: '/novels/:id/fetch-all',
      handle: async (request) => ok(await s.fullFetch.get(novelId(request))),
    },
    {
      method: 'DELETE',
      path: '/novels/:id/fetch-all',
      handle: async (request) => ok(await s.fullFetch.cancel(novelId(request))),
    },
    {
      method: 'GET',
      path: '/novels/:id/epub',
      async handle(request) {
        const { fileName, content } = await s.epubExport.exportNovel(novelId(request));
        return {
          status: 200,
          file: {
            mediaType: 'application/epub+zip',
            name: fileName,
            bytes: await collect(content),
          },
        };
      },
    },

    // Terms
    { method: 'GET', path: '/terms', handle: async () => ok({ terms: await s.terms.list() }) },
    {
      method: 'POST',
      path: '/terms',
      async handle(request) {
        const fields = parseBody(termCreateBody, request.body);
        return ok({ term: await s.terms.create(fields) }, 201);
      },
    },
    {
      method: 'PATCH',
      path: '/terms/:id',
      async handle(request) {
        const changes = parseBody(termUpdateBody, request.body);
        return ok({ term: await s.terms.update(termId(request), changes) });
      },
    },
    {
      method: 'DELETE',
      path: '/terms/:id',
      async handle(request) {
        await s.terms.remove(termId(request));
        return ok(null);
      },
    },

    // Covers, outside the envelope like the server's /covers.
    {
      method: 'GET',
      path: '/covers/:id',
      async handle(request) {
        const cover = await findCover(s.db, novelId(request));
        if (!cover) throw new AppError(404, CATALOG_MESSAGES.novelNotFound);
        return {
          status: 200,
          file: { mediaType: cover.mediaType, name: null, bytes: cover.bytes },
        };
      },
    },

    // Imports
    {
      method: 'POST',
      path: '/import/url',
      async handle({ body }) {
        const { url } = parseBody(importUrlBody, body);
        return ok(await s.imports.importUrl(url), 202);
      },
    },
    {
      method: 'POST',
      path: '/import/epub',
      async handle({ file }) {
        const upload = epubUpload(file);
        const { status, body } = await s.epubImports.importEpub(upload);
        return ok(body, status);
      },
    },
    {
      method: 'GET',
      path: '/import/recent',
      async handle({ query }) {
        const { limit: count = RECENT_IMPORTS_LIMITS.default } = parseQuery(
          recentImportsQuery,
          query,
        );
        return ok({ jobs: await s.imports.recentImports(count) });
      },
    },

    // Reader
    {
      method: 'GET',
      path: '/reader/:novelId/chapters/:number',
      async handle(request) {
        const chapter = await s.reader.getChapter(
          novelId(request, 'novelId'),
          chapterNumber(request.params.number),
        );
        return ok(chapter, chapter.status === 'fetching' ? 202 : 200);
      },
    },
    {
      method: 'POST',
      path: '/reader/:novelId/chapters/:number/fetch',
      async handle(request) {
        const fetch = await s.reader.fetchChapter(
          novelId(request, 'novelId'),
          chapterNumber(request.params.number),
        );
        return ok(fetch, fetch.jobId === null ? 200 : 202);
      },
    },
    {
      method: 'POST',
      path: '/reader/:novelId/chapters/:number/read',
      handle: async (request) =>
        ok(
          await s.reader.markRead(
            novelId(request, 'novelId'),
            chapterNumber(request.params.number),
          ),
        ),
    },

    // History and profile
    {
      method: 'GET',
      path: '/history',
      async handle({ query }) {
        const q = parseQuery(historyQuery, query);
        const cursor = q.cursor === undefined ? null : parseCursor(q.cursor);
        if (q.cursor !== undefined && cursor === null) {
          throw new AppError(400, HISTORY_MESSAGES.cursor);
        }
        return ok(
          await s.history.chapters({
            range: q.range ?? 'all',
            novelId: q.novelId ?? null,
            cursor,
            limit: q.limit ?? HISTORY_LIMITS.default,
          }),
        );
      },
    },
    {
      method: 'GET',
      path: '/history/stats',
      async handle({ query }) {
        const q = parseQuery(historyStatsQuery, query);
        return ok(await s.history.stats({ range: q.range ?? 'all', novelId: q.novelId ?? null }));
      },
    },
    {
      method: 'GET',
      path: '/history/novels',
      async handle({ query }) {
        const q = parseQuery(historyNovelsQuery, query);
        return ok(
          await s.history.novels({ q: q.q, limit: q.limit ?? HISTORY_NOVELS_LIMITS.default }),
        );
      },
    },
    {
      method: 'GET',
      path: '/history/by-novel',
      async handle({ query }) {
        const q = parseQuery(historyByNovelQuery, query);
        return ok(
          await s.history.byNovel({
            range: q.range ?? 'all',
            page: q.page ?? 1,
            limit: q.limit ?? HISTORY_BY_NOVEL_LIMITS.default,
          }),
        );
      },
    },
    {
      method: 'GET',
      path: '/user/profile',
      handle: async () => ok({ profile: await s.history.profile() }),
    },
    {
      method: 'GET',
      path: '/user/preferences',
      handle: async () => ok({ preferences: await s.preferences.get() }),
    },
    {
      method: 'PATCH',
      path: '/user/preferences',
      async handle({ body }) {
        const changes = parseBody(preferencesBody, body);
        return ok({ preferences: await s.preferences.update(changes) });
      },
    },

    // Search, jobs, sources, update runs, exports
    {
      method: 'GET',
      path: '/search',
      async handle({ query }) {
        const q = parseQuery(searchQuery, query);
        return ok(await s.catalog.search({ q: q.q, limit: q.limit ?? SEARCH_LIMITS.default }));
      },
    },
    {
      method: 'GET',
      path: '/jobs/:id',
      handle: async ({ params }) =>
        ok({ job: await s.catalog.getJob(idParam(params.id, CATALOG_MESSAGES.jobNotFound)) }),
    },
    {
      method: 'GET',
      path: '/sources',
      handle: async () => ok({ sources: await listSources(s.db) }),
    },
    {
      method: 'GET',
      path: '/sources/:key/account',
      handle: async ({ params }) => ok(await s.accounts.status(params.key ?? '')),
    },
    {
      method: 'POST',
      path: '/sources/:key/account/link',
      async handle({ params, body }) {
        const { link } = parseBody(signInLinkBody, body);
        return ok(await s.accounts.signInWithLink(params.key ?? '', link));
      },
    },
    {
      method: 'GET',
      path: '/update-jobs',
      async handle({ query }) {
        const q = parseQuery(updateRunsQuery, query);
        return ok(
          await s.updates.listRuns({
            page: q.page ?? 1,
            limit: q.limit ?? UPDATE_RUN_PAGE_LIMITS.default,
          }),
        );
      },
    },
    { method: 'GET', path: '/exports', handle: async () => ok(await s.fullFetch.list()) },
  ];
}
