// Runs the job queue inside the app. A few loops take jobs by priority (the chapter a
// reader is waiting for first); whole-novel fetches run in a lane of their own, since
// each can take hours and nothing else should wait behind one, with one novel per site at
// a time. Requests to one site stay apart however many jobs run (the session's throttle).
//
// Jobs left running when the app last stopped start again. Retries wait in the queue
// until their time; the loops look for them every few seconds, and `wake()` starts new
// work at once. A scheduled update check is queued whenever one is due.
//
// The platform can pause the runner (Android: the app is in the background without its
// service, so it has no network) and hold whole-novel fetches (on mobile data, when the
// reader wants those on Wi-Fi only). Jobs stopped either way go back to the queue as they
// were, without counting an attempt.
import type { JobType } from '@webnovel-hub/shared';
import type { Database } from '../db/database.js';
import { sleep } from '../lib/sleep.js';
import type { Logger } from '../logger.js';
import { findPreferences, findUpdateIntervalHours } from '../repositories/preferences.js';
import type { Registry } from '../scraper/adapters/registry.js';
import type { Notice } from '../scraper/http.js';
import { NetworkError, NovelDeleted, classify } from '../scraper/errors.js';
import { type Fetcher, type SessionOptions, SourceSession } from '../scraper/session.js';
import { fetchChapter } from './chapter-fetch.js';
import type { Handler, JobContext } from './context.js';
import { fetchAllChapters } from './full-fetch.js';
import { ingestNovel } from './ingestion.js';
import { addedNotice, downloadedNotice, failedNotice, noticeStyle } from './notice.js';
import {
  type ClaimedJob,
  FULL_FETCH,
  JobLost,
  claimFullFetch,
  claimJob,
  completeJob,
  failJob,
  isRunning,
  releaseJob,
  reportProgress,
  requeueInterrupted,
} from './queue.js';
import { scheduleDueRun } from './scheduler.js';
import { checkNovelForUpdates, checkNovelsForUpdates } from './update-check.js';

interface HandlerSpec {
  handler: Handler;
  /** Milliseconds one attempt may take; null for a job that paces itself over hours. */
  timeout: number | null;
}

const HANDLERS: Record<JobType, HandlerSpec> = {
  novel_ingestion: { handler: ingestNovel, timeout: 600_000 },
  chapter_fetch: { handler: fetchChapter, timeout: 180_000 },
  // A scheduled run checks every followed novel in turn; a retry carries on with the
  // novels it hadn't reached.
  update_check: { handler: checkNovelsForUpdates, timeout: 3 * 3_600_000 },
  manual_update_check: { handler: checkNovelForUpdates, timeout: 900_000 },
  novel_fetch_all: { handler: fetchAllChapters, timeout: null },
};

const LOOP_TYPES = (Object.keys(HANDLERS) as JobType[]).filter((type) => type !== FULL_FETCH);

/** The app is stopping: the job goes back to the queue without counting an attempt. */
class Stopping extends Error {}

export interface RunnerOptions {
  db: Database;
  registry: Registry;
  fetcher: Fetcher;
  logger: Logger;
  maxRetries: number;
  /** Jobs run side by side, besides whole-novel fetches. */
  concurrency?: number;
  /** How often idle loops look for retries whose time has come, in milliseconds. */
  pollInterval?: number;
  /** How often a running job checks that it wasn't cancelled. */
  aliveCheck?: number;
  /** Whether scheduled update checks are queued when due (tests turn it off). */
  scheduleUpdates?: boolean;
  /** How often the update schedule is checked. */
  scheduleCheck?: number;
  /** Tests pass a pause that doesn't wait and a fixed random source. */
  sleep?: typeof sleep;
  random?: () => number;
  /** Shows a system notification, where the platform can. */
  notify?: (notice: Notice) => void;
}

export class JobRunner {
  private running = false;
  private stopping: Promise<void> | null = null;
  private wakeLoops: (() => void)[] = [];
  private wakeLane: (() => void) | null = null;
  private paused = false;
  private wholeNovelsHeld = false;
  private readonly active = new Map<
    string,
    { type: JobType; controller: AbortController; done: Promise<void> }
  >();
  private readonly workers: Promise<void>[] = [];
  private scheduler: ReturnType<typeof setInterval> | null = null;

  private readonly options: RunnerOptions;

  constructor(options: RunnerOptions) {
    this.options = options;
  }

  /** Starts running jobs: those interrupted last time first, then whatever is queued. */
  async start(): Promise<void> {
    if (this.running) return;
    const { db, logger } = this.options;
    const requeued = await requeueInterrupted(db);
    if (requeued > 0) logger.info({ jobs: requeued }, 'interrupted jobs queued again');
    this.running = true;
    for (let n = 0; n < (this.options.concurrency ?? 2); n += 1) this.workers.push(this.loop());
    this.workers.push(this.lane());
    if (this.options.scheduleUpdates ?? true) {
      void this.checkSchedule();
      this.scheduler = setInterval(
        () => void this.checkSchedule(),
        this.options.scheduleCheck ?? 60_000,
      );
    }
    logger.info({ sources: this.options.registry.adapters.length }, 'job runner started');
  }

  /** Something was queued: start on it now rather than at the next look. */
  wake(): void {
    for (const wake of this.wakeLoops.splice(0)) wake();
    this.wakeLane?.();
  }

  /** Hands the running jobs back to the queue and takes no more until `resume()`. */
  pause(): Promise<void> {
    this.paused = true;
    return this.handBack(() => true);
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.wake();
    if (this.running && (this.options.scheduleUpdates ?? true)) void this.checkSchedule();
  }

  /** While held, whole-novel fetches wait in the queue; running ones go back to it. */
  async holdWholeNovels(hold: boolean): Promise<void> {
    if (this.wholeNovelsHeld === hold) return;
    this.wholeNovelsHeld = hold;
    if (hold) await this.handBack((type) => type === FULL_FETCH);
    else this.wake();
  }

  private async handBack(which: (type: JobType) => boolean): Promise<void> {
    const stopped = [...this.active.values()].filter((job) => which(job.type));
    for (const { controller } of stopped) controller.abort(new Stopping());
    await Promise.all(stopped.map((job) => job.done));
  }

  /**
   * Stops taking jobs and hands the running ones back to the queue; they start again
   * next time.
   */
  stop(): Promise<void> {
    this.stopping ??= (async () => {
      this.running = false;
      if (this.scheduler) clearInterval(this.scheduler);
      this.wake();
      for (const { controller } of this.active.values()) controller.abort(new Stopping());
      await Promise.all([...this.workers, ...[...this.active.values()].map((job) => job.done)]);
      this.options.logger.info({}, 'job runner stopped');
    })();
    return this.stopping;
  }

  private idle(register: (wake: () => void) => void): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, this.options.pollInterval ?? 5_000);
      register(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private async loop(): Promise<void> {
    while (this.running) {
      let job: ClaimedJob | null = null;
      try {
        if (!this.paused) job = await claimJob(this.options.db, LOOP_TYPES);
      } catch (error) {
        this.options.logger.warn({ err: error }, 'could not take a job');
      }
      if (job) await this.process(job);
      else if (this.running) await this.idle((wake) => this.wakeLoops.push(wake));
    }
  }

  /** Starts whole-novel fetches whenever their site is free. */
  private async lane(): Promise<void> {
    while (this.running) {
      let job: ClaimedJob | null = null;
      try {
        if (!this.paused && !this.wholeNovelsHeld) job = await claimFullFetch(this.options.db);
      } catch (error) {
        this.options.logger.warn({ err: error }, 'could not take a whole-novel fetch');
      }
      if (job) {
        // Not awaited: other sites' novels may start meanwhile. Its end frees its site.
        void this.process(job).then(() => this.wakeLane?.());
      } else if (this.running) {
        await this.idle((wake) => (this.wakeLane = wake));
      }
    }
  }

  private process(job: ClaimedJob): Promise<void> {
    const controller = new AbortController();
    // Taken just as the runner paused (or held its kind): straight back to the queue.
    if (this.paused || (this.wholeNovelsHeld && job.type === FULL_FETCH)) {
      controller.abort(new Stopping());
    }
    const done = this.run(job, controller).finally(() => this.active.delete(job.id));
    this.active.set(job.id, { type: job.type, controller, done });
    return done;
  }

  private async run(job: ClaimedJob, controller: AbortController): Promise<void> {
    const { db, registry, fetcher, logger } = this.options;
    const spec = HANDLERS[job.type];
    const context = {
      job: job.id,
      type: job.type,
      attempt: `${job.retryCount + 1}/${job.maxRetries + 1}`,
    };
    const started = Date.now();
    logger.info(context, 'job started');

    const timeout =
      spec.timeout === null
        ? null
        : setTimeout(
            () => controller.abort(new NetworkError(`the job took over ${spec.timeout! / 1000} s`)),
            spec.timeout,
          );
    // A cancelled job (its row deleted) stops at its next step.
    const alive = setInterval(() => {
      isRunning(db, job.id).then(
        (running) => {
          if (!running) controller.abort(new JobLost(job.id));
        },
        () => undefined,
      );
    }, this.options.aliveCheck ?? 10_000);

    const signal = controller.signal;
    const pause = this.options.sleep ?? sleep;
    const options = await sessionOptions(db);
    const ctx: JobContext = {
      job,
      db,
      registry,
      session: new SourceSession(fetcher, signal, options),
      newSession: () => new SourceSession(fetcher, signal, options),
      signal,
      logger,
      progress: async (message, percent = null) => {
        signal.throwIfAborted();
        await reportProgress(db, job, message, percent);
      },
      sleep: (ms) => pause(ms, signal),
      random: this.options.random ?? Math.random,
      notify: (notice) => this.options.notify?.(notice),
    };

    // An abort ends the attempt at once, even mid-request; whatever the handler still
    // writes afterwards is either harmless or guarded by the job's status.
    const aborted = new Promise<never>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason as Error), { once: true });
    });
    aborted.catch(() => undefined);

    try {
      const result = await Promise.race([spec.handler(ctx), aborted]);
      signal.throwIfAborted();
      await completeJob(db, job, result);
      logger.info(
        { ...context, seconds: Math.round((Date.now() - started) / 100) / 10 },
        'job completed',
      );
      void this.announceEnd(job, result, null);
    } catch (thrown) {
      const error = signal.aborted ? (signal.reason as unknown) : thrown;
      await this.settle(job, error, context);
    } finally {
      if (timeout) clearTimeout(timeout);
      clearInterval(alive);
    }
  }

  private async settle(job: ClaimedJob, thrown: unknown, context: object): Promise<void> {
    const { db, registry, logger } = this.options;
    try {
      if (thrown instanceof Stopping) {
        if (await releaseJob(db, job)) logger.info(context, 'job handed back to the queue');
        return;
      }
      if (thrown instanceof JobLost) {
        logger.info(context, 'job dropped: it was cancelled or its novel deleted');
        return;
      }
      const error = classify(thrown);
      const plan = await failJob(
        db,
        job,
        error,
        registry.siteName(job.sourceUrl),
        this.options.random ?? Math.random,
      );
      const details = { ...context, errorType: error.type, detail: error.detail.split('\n')[0] };
      if (plan.final) void this.announceEnd(job, null, plan.message);
      if (plan.final) logger.error(details, 'job failed');
      else
        logger.warn(
          { ...details, retryInSeconds: Math.round((plan.delay ?? 0) / 1000) },
          'attempt failed',
        );
    } catch (error) {
      if (error instanceof JobLost) {
        // Deleting a novel deletes its jobs too: nothing is wrong.
        if (classify(thrown) instanceof NovelDeleted)
          logger.info(context, 'job dropped: its novel was deleted');
        else logger.info(context, 'job finished, but it was cancelled meanwhile');
        return;
      }
      logger.error({ ...context, err: error }, 'could not record how the job ended');
    }
  }

  /**
   * Tells the reader that a whole-novel download or a novel added from its address is
   * done, or stopped for good (`failure`, the reason they see).
   */
  private async announceEnd(
    job: ClaimedJob,
    result: Record<string, unknown> | null,
    failure: string | null,
  ): Promise<void> {
    const { db, logger, notify } = this.options;
    if (!notify || (job.type !== FULL_FETCH && job.type !== 'novel_ingestion')) return;
    try {
      const style = noticeStyle(await findPreferences(db));
      const added = typeof result?.novel_id === 'string' ? result.novel_id : null;
      const novelId = job.novelId ?? added;
      const { rows } = await db.query<{ title: string; chapters: number }>(
        `SELECT title, (SELECT count(*) FROM chapters WHERE novel_id = n.id) AS chapters
         FROM novels n WHERE id = $1`,
        [novelId],
      );
      const novel = novelId && rows[0] ? { id: novelId, ...rows[0] } : null;
      const what = job.type === FULL_FETCH ? 'download' : 'import';
      if (failure !== null) notify(failedNotice(what, novel, failure, style));
      else if (!novel || result?.duplicate === true) return;
      else if (what === 'download')
        notify(downloadedNotice(novel, Number(result?.failed) || 0, style));
      else notify(addedNotice(novel, style));
    } catch (error) {
      logger.warn({ job: job.id, err: error }, 'could not tell the reader how the job ended');
    }
  }

  private async checkSchedule(): Promise<void> {
    const { db, logger, maxRetries } = this.options;
    if (this.paused) return;
    try {
      const intervalHours = await findUpdateIntervalHours(db);
      const jobId = await scheduleDueRun(db, { intervalHours, maxRetries });
      if (jobId) {
        logger.info({ job: jobId }, 'scheduled an update check');
        this.wake();
      }
    } catch (error) {
      logger.warn({ err: error }, 'could not check the update schedule');
    }
  }
}

/** The reader's fetching choices, read as each job starts; the defaults if that fails. */
async function sessionOptions(db: Database): Promise<SessionOptions> {
  try {
    const preferences = await findPreferences(db);
    return { wtrLabMachineTranslation: preferences.wtrLabMachineTranslation };
  } catch {
    return {};
  }
}
