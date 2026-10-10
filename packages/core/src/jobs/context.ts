import type { Database } from '../db/database.js';
import type { Sleep } from '../lib/sleep.js';
import type { Logger } from '../logger.js';
import type { Registry } from '../scraper/adapters/registry.js';
import type { Notice } from '../scraper/http.js';
import type { SourceSession } from '../scraper/session.js';
import type { ClaimedJob } from './queue.js';

/** What a job handler works with. */
export interface JobContext {
  job: ClaimedJob;
  db: Database;
  registry: Registry;
  /** The job's session: its page cache lasts as long as the job. */
  session: SourceSession;
  /** For a job that wants a fresh session per step (one per novel, one per chapter). */
  newSession(): SourceSession;
  /** Aborted when the job runs out of time, is cancelled, or the app stops. */
  signal: AbortSignal;
  logger: Logger;
  /** Shows the reader how the job is getting on; throws `JobLost` if the job is gone. */
  progress(message: string, percent?: number | null): Promise<void>;
  /** Pauses for `ms`, or until the job is aborted. */
  sleep: (ms: number) => ReturnType<Sleep>;
  random: () => number;
  /** Tells the reader something worth knowing while the app is out of sight. */
  notify: (notice: Notice) => void;
}

/** A job type's work: resolves to the job's result, stored in snake_case. */
export type Handler = (ctx: JobContext) => Promise<Record<string, unknown>>;
