// `novel_fetch_all`: every chapter of a novel that isn't stored yet, for a reader who
// wants the whole novel (to read offline, or to export it). Chapters come one at a time in
// reading order, with pauses far longer than the per-host gap (`Adapter.fetchAllDelay`,
// with jitter), so a long novel arrives like a patient reader rather than a crawler. These
// jobs run in a lane of their own, one novel per site at a time.
//
// The pace adapts to the site. A refusal (HTTP 429 or 403, a challenge page) stops
// fetching for a cooldown, 5 minutes and doubling with each refusal in a row (or the
// site's Retry-After if longer, up to an hour), then tries the same chapter again. It
// also doubles the site's slowdown, the factor every pause is multiplied by, kept in
// `source_sites.fetch_slowdown` so the next novel from that site starts at the pace this
// one learned; every `RELAX_AFTER` chapters without a refusal lower it by a quarter,
// never below 1. After `MAX_REFUSALS` refusals in a row the job stops (`KeptRefusing`),
// keeping every chapter it stored; asking again resumes.
//
// Other failures are the chapter's own: it is tried once more after a pause, then its
// failure is recorded on it and the job moves on. `MAX_FAILURES` chapters failing in a
// row mean the site itself is in trouble, and the job fails with that error (retried
// later like any job, resuming where it stopped). Chapters an update check adds while the
// job runs are fetched too.
import type { Queryable } from '../db/database.js';
import { NOW } from '../db/sql.js';
import { KeptRefusing, PermanentError, RateLimited, classify } from '../scraper/errors.js';
import { fetchAndStore } from './chapter-fetch.js';
import type { Handler } from './context.js';

/** Each pause is the site's pause times its slowdown, plus a random 10 to 50 % of that. */
const JITTER = [0.1, 0.5] as const;
/** The cooldown after a first refusal; each refusal in a row doubles it, up to the maximum. */
const FIRST_COOLDOWN = 300_000;
const MAX_COOLDOWN = 3_600_000;
/** The slowest a site's pace gets (source_sites allows up to 64). */
const MAX_SLOWDOWN = 16;
/** Chapters fetched without a refusal before the slowdown is lowered. */
const RELAX_AFTER = 50;
const RELAX_FACTOR = 0.75;
/** Refusals in a row that end the job. */
const MAX_REFUSALS = 5;
/** Chapters failing in a row (not refusals) that end the job. */
const MAX_FAILURES = 5;
/** Tries per chapter before its failure is recorded and the job moves on. */
const CHAPTER_ATTEMPTS = 2;

/** How long to pause between one site's chapters, learning from its refusals. */
export class Pacing {
  /** Refusals since the last chapter fetched. */
  refusals = 0;
  /** Chapters fetched since the slowdown last changed. */
  private streak = 0;
  /** The site's pause in milliseconds. */
  private readonly base: number;
  slowdown: number;

  constructor(base: number, slowdown = 1) {
    this.base = base;
    this.slowdown = slowdown;
  }

  pause(random: () => number): number {
    const [low, high] = JITTER;
    return this.base * this.slowdown * (1 + low + random() * (high - low));
  }

  /** A chapter came through. True when that lowered the slowdown. */
  fetched(): boolean {
    this.refusals = 0;
    this.streak += 1;
    if (this.slowdown > 1 && this.streak >= RELAX_AFTER) {
      this.slowdown = Math.max(1, this.slowdown * RELAX_FACTOR);
      this.streak = 0;
      return true;
    }
    return false;
  }

  /** The site refused: slow down. Returns the cooldown before trying again. */
  refused(retryAfter: number | null): number {
    this.refusals += 1;
    this.streak = 0;
    this.slowdown = Math.min(MAX_SLOWDOWN, this.slowdown * 2);
    const cooldown = Math.min(MAX_COOLDOWN, FIRST_COOLDOWN * 2 ** (this.refusals - 1));
    return Math.max(cooldown, Math.min(retryAfter ?? 0, MAX_COOLDOWN));
  }

  get gaveUp(): boolean {
    return this.refusals >= MAX_REFUSALS;
  }
}

const about = (ms: number) => {
  const minutes = Math.round(ms / 60_000);
  return minutes > 1 ? `${minutes} minutes` : 'a minute';
};

const storedMessage = (stored: number, total: number) =>
  `Fetched ${stored.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} chapters`;

// 100 is for a finished job.
const percent = (stored: number, total: number) =>
  total ? Math.min(99, Math.floor((stored * 100) / total)) : 0;

async function counts(db: Queryable, novelId: string | null) {
  const { rows } = await db.query<{ stored: number; total: number }>(
    `SELECT count(*) FILTER (WHERE is_fetched = 1) AS stored, count(*) AS total
     FROM chapters WHERE novel_id = $1`,
    [novelId],
  );
  return rows[0] ?? { stored: 0, total: 0 };
}

async function loadSlowdown(db: Queryable, source: string): Promise<number> {
  const { rows } = await db.query<{ fetch_slowdown: number }>(
    'SELECT fetch_slowdown FROM source_sites WHERE key = $1',
    [source],
  );
  const value = rows[0]?.fetch_slowdown;
  return value === undefined ? 1 : Math.min(MAX_SLOWDOWN, Math.max(1, value));
}

async function saveSlowdown(db: Queryable, source: string, slowdown: number, refused: boolean) {
  await db.query(
    `UPDATE source_sites
     SET fetch_slowdown = $2, last_refused_at = CASE WHEN $3 THEN ${NOW} ELSE last_refused_at END
     WHERE key = $1`,
    [source, slowdown, refused],
  );
}

export const fetchAllChapters: Handler = async (ctx) => {
  const { db, job } = ctx;
  // The novel's source; the scrape_jobs_refs_match_type CHECK guarantees it.
  const source = String(job.payload.source);
  const site = ctx.registry.siteName(job.sourceUrl);
  let pacing: Pacing | null = null;
  let { stored, total } = await counts(db, job.novelId);
  const tried: string[] = [];
  let fetched = 0;
  let failed = 0;
  let failuresInARow = 0;
  // Whether the last step asked the site for something, so the next one pauses first.
  let rest = false;

  for (;;) {
    const { rows: missing } = await db.query<{ id: string; source_url: string }>(
      `SELECT id, source_url FROM chapters
       WHERE novel_id = $1 AND is_fetched = 0 AND source_url IS NOT NULL
         AND id NOT IN (SELECT value FROM json_each($2))
       ORDER BY number`,
      [job.novelId, tried],
    );
    if (missing.length === 0) break;

    for (const chapter of missing) {
      tried.push(chapter.id);
      // Known once there is something to fetch: the first chapter's site.
      pacing ??= new Pacing(
        ctx.registry.forUrl(chapter.source_url).fetchAllDelay,
        await loadSlowdown(db, source),
      );
      let attempts = 0;
      for (;;) {
        if (rest) await ctx.sleep(pacing.pause(ctx.random));
        rest = true;
        let result;
        try {
          result = await fetchAndStore(db, ctx.registry, ctx.newSession(), {
            novelId: job.novelId,
            chapterId: chapter.id,
          });
        } catch (thrown) {
          ctx.signal.throwIfAborted();
          const error = classify(thrown);
          if (error instanceof PermanentError) throw error;
          if (error instanceof RateLimited) {
            const cooldown = pacing.refused(error.retryAfter);
            await saveSlowdown(db, source, pacing.slowdown, true);
            if (pacing.gaveUp) {
              throw new KeptRefusing(
                `${site} refused ${pacing.refusals} times in a row: ${error.detail}`,
              );
            }
            await ctx.progress(
              `${site} asked us to slow down, so fetching pauses for about ${about(cooldown)}. ` +
                `${storedMessage(stored, total)} so far.`,
              percent(stored, total),
            );
            await ctx.sleep(cooldown);
            rest = false; // the cooldown was the pause
            continue;
          }
          attempts += 1;
          if (attempts < CHAPTER_ATTEMPTS) continue;
          failed += 1;
          failuresInARow += 1;
          await db.query(
            `UPDATE chapters SET fetch_error_type = $2, fetch_error_message = $3
             WHERE id = $1 AND is_fetched = 0`,
            [chapter.id, error.type, error.userMessage(site, true)],
          );
          if (failuresInARow >= MAX_FAILURES) throw error;
          break;
        }
        if (!result.fetched) {
          rest = false; // a reader's fetch got there first: nothing was asked of the site
          break;
        }
        fetched += 1;
        stored += 1;
        failuresInARow = 0;
        if (pacing.fetched()) await saveSlowdown(db, source, pacing.slowdown, false);
        await ctx.progress(storedMessage(stored, total), percent(stored, total));
        break;
      }
    }
    // An update check may have added chapters meanwhile.
    ({ stored, total } = await counts(db, job.novelId));
  }
  return { fetched, failed };
};
