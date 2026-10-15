// Update checks: the chapters a site added to the novels the reader follows. Two job types
// share one path:
//
// - `update_check`, a scheduled run over every novel in Reading or Following (and any
//   novel the reader wants to be told about), stalest first, one after another;
// - `manual_update_check`, one novel the reader asked about.
//
// The site's current chapter list is matched to the stored chapters by
// `Adapter.chapterKey`. Chapters the site added are stored after the current last number
// (numbers never change) and marked new, and the novel's chapter count and dates are
// updated, all in one transaction. Stored chapters are never renumbered or removed.
//
// A novel whose check fails is flagged with a plain-language reason. A scheduled run moves
// on to the next novel and leaves the retry to the next run; a manual check is retried
// like any job and flags the novel only when its last attempt fails. The run records the
// novels checked, the chapters found and each failure; its status follows its job (a
// trigger in the schema). A scheduled run then tells the reader, as they chose, about the
// new chapters and about novels whose check started failing.
import { EPUB_SOURCE } from '@webnovel-hub/shared';
import type { Queryable } from '../db/database.js';
import { NOW } from '../db/sql.js';
import {
  CHECKED_ENTRIES,
  novelsToAnnounce,
  unseenNewChapters,
} from '../repositories/notifications.js';
import { findPreferences } from '../repositories/preferences.js';
import type { Adapter, ChapterRef } from '../scraper/adapters/base.js';
import {
  InvalidJob,
  NetworkError,
  PermanentError,
  type ScrapeError,
  StructureChanged,
  UnsupportedUrl,
  classify,
} from '../scraper/errors.js';
import type { Handler, JobContext } from './context.js';
import { insertChapters } from './ingestion.js';
import { checkFailedNotice, newChaptersNotices, noticeStyle } from './notice.js';
import { JobLost, willRetry } from './queue.js';

/** How long one novel's chapter list may take before it counts as a network error. */
const NOVEL_TIMEOUT = 600_000;

const UNSUPPORTED_MESSAGE =
  "We can't check this novel for new chapters: its address isn't on a site we support.";
const EPUB_MESSAGE = 'EPUB novels have no source site to check for new chapters.';

interface Novel {
  id: string;
  title: string;
  source: string;
  source_url: string;
}

interface Outcome {
  newChapters: number;
  error: ScrapeError | null;
}

function runId(ctx: JobContext): string {
  const id = ctx.job.updateRunId;
  if (!id) throw new InvalidJob(`${ctx.job.type} job ${ctx.job.id} has no update run`);
  return id;
}

/** `update_check`: every novel the reader follows. */
export const checkNovelsForUpdates: Handler = async (ctx) => {
  const run = runId(ctx);
  const { rows: started } = await ctx.db.query<{ started_at: string | null }>(
    'SELECT started_at FROM update_job_runs WHERE id = $1',
    [run],
  );
  // A retried run (after a timeout, or the app closing) skips the novels it already
  // checked: their last check is newer than the run's first start.
  const { rows: novels } = await ctx.db.query<Novel>(
    `SELECT n.id, n.title, n.source, n.source_url
     FROM novels n JOIN library_entries e ON e.novel_id = n.id
     WHERE n.source <> $1 AND ${CHECKED_ENTRIES}
       AND (n.last_checked_at IS NULL OR n.last_checked_at < $2)
     ORDER BY n.last_checked_at NULLS FIRST, n.created_at`,
    [EPUB_SOURCE, started[0]?.started_at ?? null],
  );
  const total = novels.length;
  await ctx.progress(
    `Checking ${total.toLocaleString('en-US')} novel${total === 1 ? '' : 's'} for new chapters…`,
    0,
  );
  const updated: Announced[] = [];
  const failing: Announced[] = [];
  for (const [index, novel] of novels.entries()) {
    const outcome = await checkNovel(ctx, novel, false);
    if (outcome.error && (await recordFailure(ctx, novel, outcome.error))) {
      failing.push({ id: novel.id, title: novel.title, count: 0 });
    }
    if (outcome.newChapters > 0) {
      updated.push({ id: novel.id, title: novel.title, count: outcome.newChapters });
    }
    const done = index + 1;
    await ctx.progress(
      `Checked ${done.toLocaleString('en-US')} / ${total.toLocaleString('en-US')}`,
      Math.round((100 * done) / total),
    );
  }
  const { rows } = await ctx.db.query<{ novels_checked: number; new_chapters_found: number }>(
    'SELECT novels_checked, new_chapters_found FROM update_job_runs WHERE id = $1',
    [run],
  );
  await announce(ctx, updated, failing);
  return {
    novels_checked: rows[0]?.novels_checked ?? 0,
    new_chapters: rows[0]?.new_chapters_found ?? 0,
  };
};

interface Announced {
  id: string;
  title: string;
  count: number;
}

/**
 * Tells the reader about the novels they want to hear about: their new chapters, and the
 * novels whose check started failing.
 */
async function announce(ctx: JobContext, updated: Announced[], failing: Announced[]) {
  if (updated.length === 0 && failing.length === 0) return;
  const preferences = await findPreferences(ctx.db);
  const style = noticeStyle(preferences);
  const wanted = await novelsToAnnounce(
    ctx.db,
    [...updated, ...failing].map((novel) => novel.id),
    preferences.notifyNovels,
  );
  let fresh = updated.filter((novel) => wanted.has(novel.id));
  if (style.eachNovel) {
    // A novel's notice replaces its last one, so it counts every chapter not opened yet.
    const unseen = await unseenNewChapters(
      ctx.db,
      fresh.map((novel) => novel.id),
    );
    fresh = fresh.map((novel) => ({
      ...novel,
      count: Math.max(novel.count, unseen.get(novel.id) ?? 0),
    }));
  }
  for (const notice of newChaptersNotices(fresh, style)) ctx.notify(notice);
  const broken = failing.filter((novel) => wanted.has(novel.id));
  if (broken.length > 0) ctx.notify(checkFailedNotice(broken, style));
}

/** `manual_update_check`: the one novel the reader asked about. */
export const checkNovelForUpdates: Handler = async (ctx) => {
  runId(ctx);
  const { rows } = await ctx.db.query<Novel>(
    'SELECT id, title, source, source_url FROM novels WHERE id = $1',
    [ctx.job.novelId],
  );
  const novel = rows[0];
  if (!novel) throw new InvalidJob(`novel ${ctx.job.novelId} does not exist`);
  if (novel.source === EPUB_SOURCE)
    throw new PermanentError(`novel ${novel.id} is an EPUB import`, EPUB_MESSAGE);

  await ctx.progress(`Checking ${ctx.registry.siteName(novel.source_url)} for new chapters…`, 10);
  const outcome = await checkNovel(ctx, novel, true);
  if (!outcome.error) return { new_chapters: outcome.newChapters };
  if (willRetry(ctx.job, outcome.error)) {
    // Not flagged yet: the next attempt may well succeed.
    await ctx.db.query(`UPDATE novels SET last_checked_at = ${NOW} WHERE id = $1`, [novel.id]);
  } else {
    await recordFailure(ctx, novel, outcome.error);
  }
  throw outcome.error;
};

/** Fetches the novel's chapter list and stores what's new. Never throws a scrape error. */
async function checkNovel(ctx: JobContext, novel: Novel, manual: boolean): Promise<Outcome> {
  let adapter: Adapter;
  let chapters: ChapterRef[];
  try {
    ({ adapter, chapters } = await fetchChapterList(ctx, novel));
  } catch (error) {
    ctx.signal.throwIfAborted();
    return { newChapters: 0, error: classify(error) };
  }
  try {
    const stored = await storeNewChapters(ctx, novel, adapter, chapters, manual);
    if (stored > 0) ctx.logger.info({ novel: novel.id, newChapters: stored }, 'new chapters found');
    return { newChapters: stored, error: null };
  } catch (error) {
    if (error instanceof StructureChanged) return { newChapters: 0, error };
    throw error;
  }
}

async function fetchChapterList(ctx: JobContext, novel: Novel) {
  let adapter: Adapter;
  try {
    adapter = ctx.registry.forUrl(novel.source_url);
  } catch (error) {
    if (error instanceof UnsupportedUrl)
      throw new UnsupportedUrl(error.detail, UNSUPPORTED_MESSAGE);
    throw error;
  }
  // A session per novel, so its page cache ends with the novel.
  const session = ctx.newSession();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new NetworkError(`checking ${novel.source_url} took over ${NOVEL_TIMEOUT / 1000} s`),
        ),
      NOVEL_TIMEOUT,
    );
  });
  try {
    const chapters = await Promise.race([
      adapter.fetchChapterList(session, novel.source_url),
      timeout,
    ]);
    return { adapter, chapters };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Flags the novel and adds the failure to the run's log. Resolves to true when the novel's
 * checks were working until now.
 */
async function recordFailure(ctx: JobContext, novel: Novel, error: ScrapeError): Promise<boolean> {
  const message = error.updateMessage(ctx.registry.siteName(novel.source_url));
  ctx.logger.warn(
    { novel: novel.id, errorType: error.type, detail: error.detail.split('\n')[0] },
    'update check failed',
  );
  return ctx.db.withTransaction(async (tx) => {
    const { rows: before } = await tx.query<{ update_failed: number }>(
      'SELECT update_failed FROM novels WHERE id = $1',
      [novel.id],
    );
    const flagged = await tx.query(
      `UPDATE novels
       SET update_failed = 1, update_error_type = $2, update_error_message = $3,
           last_checked_at = ${NOW}
       WHERE id = $1`,
      [novel.id, error.type, message],
    );
    if (flagged.rowCount === 0) return false; // deleted meanwhile
    await logNovel(tx, ctx, 0, {
      novel_id: novel.id,
      title: novel.title,
      error_type: error.type,
      message,
    });
    return before[0]?.update_failed === 0;
  });
}

/**
 * The chapters of `chapters` that aren't stored yet, in reading order. Throws
 * `StructureChanged` when the novel has stored chapters and none of them is in the list:
 * the site's chapter addresses changed shape, and storing the list again would duplicate
 * the whole novel.
 */
export function newChapters(
  adapter: Adapter,
  storedUrls: string[],
  chapters: ChapterRef[],
): ChapterRef[] {
  const stored = new Set(storedUrls.map((url) => adapter.chapterKey(url)));
  const seen = new Set(stored);
  const fresh: ChapterRef[] = [];
  let matched = false;
  for (const chapter of chapters) {
    const key = adapter.chapterKey(chapter.url);
    matched ||= stored.has(key);
    if (!seen.has(key)) {
      seen.add(key);
      fresh.push(chapter);
    }
  }
  if (stored.size > 0 && chapters.length > 0 && !matched) {
    throw new StructureChanged(
      `none of the ${stored.size} stored chapters is in the chapter list ` +
        `(${chapters.length} chapters, first ${chapters[0]!.url})`,
    );
  }
  return fresh;
}

/** Stores the new chapters; resolves to how many (0 when the novel is gone). */
async function storeNewChapters(
  ctx: JobContext,
  novel: Novel,
  adapter: Adapter,
  chapters: ChapterRef[],
  manual: boolean,
): Promise<number> {
  ctx.signal.throwIfAborted();
  return ctx.db.withTransaction(async (tx) => {
    const { rows: stored } = await tx.query<{ number: number; source_url: string | null }>(
      'SELECT number, source_url FROM chapters WHERE novel_id = $1',
      [novel.id],
    );
    const { rows: entry } = await tx.query<{ status: string; notify: number | null }>(
      'SELECT status, notify FROM library_entries WHERE novel_id = $1',
      [novel.id],
    );
    if (entry.length === 0) return 0; // deleted while the list was fetched
    const fresh = newChapters(
      adapter,
      stored.flatMap((row) => (row.source_url ? [row.source_url] : [])),
      chapters,
    );
    const last = Math.max(0, ...stored.map((row) => row.number));
    let latest: string | null = null;
    if (fresh.length > 0) {
      const ids = await insertChapters(tx, novel.id, last + 1, fresh);
      const dates = fresh.flatMap((chapter) =>
        chapter.publishedAt ? [chapter.publishedAt.getTime()] : [],
      );
      latest = new Date(dates.length > 0 ? Math.max(...dates) : Date.now()).toISOString();
      // New for the reader when they follow the novel, asked about it themselves, or want
      // to be told about it.
      const { status, notify } = entry[0]!;
      if (manual || status === 'reading' || status === 'following' || notify === 1) {
        await tx.query(
          `INSERT INTO new_chapters (chapter_id, novel_id)
           SELECT value, $1 FROM json_each($2) WHERE true
           ON CONFLICT (chapter_id) DO NOTHING`,
          [novel.id, ids],
        );
      }
    }
    await tx.query(
      `UPDATE novels
       SET total_chapters = (SELECT count(*) FROM chapters WHERE novel_id = $1),
           latest_chapter_at = max(coalesce(latest_chapter_at, $2), coalesce($2, latest_chapter_at)),
           last_checked_at = ${NOW}, last_scraped_at = ${NOW},
           update_failed = 0, update_error_type = NULL, update_error_message = NULL
       WHERE id = $1`,
      [novel.id, latest],
    );
    await logNovel(tx, ctx, fresh.length, null);
    return fresh.length;
  });
}

/** Adds one novel to the run's log, while the job still runs. */
async function logNovel(
  tx: Queryable,
  ctx: JobContext,
  found: number,
  error: Record<string, unknown> | null,
): Promise<void> {
  const { rowCount } = await tx.query(
    `UPDATE update_job_runs
     SET novels_checked = novels_checked + 1,
         new_chapters_found = new_chapters_found + $3,
         errors = CASE WHEN $4 IS NULL THEN errors ELSE json_insert(errors, '$[#]', json($4)) END
     WHERE id = $1
       AND EXISTS (SELECT 1 FROM scrape_jobs WHERE id = $2 AND status = 'running')`,
    [runId(ctx), ctx.job.id, found, error],
  );
  if (rowCount === 0) throw new JobLost(ctx.job.id);
}
