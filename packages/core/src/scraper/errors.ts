import type { ScrapeErrorType } from '@webnovel-hub/shared';
import { isForeignKeyViolation } from '../db/errors.js';

/** Longest `error_detail` stored; the rest is cut. */
const MAX_DETAIL_LENGTH = 4000;

/**
 * A fetch that failed, in one of the four categories readers see. `detail` is for
 * diagnostics only (stored in `error_detail`); the messages are what readers read.
 */
export class ScrapeError extends Error {
  readonly type: ScrapeErrorType = 'unknown';
  /** Retried up to the job's `max_retries` when true. */
  readonly retryable: boolean = true;
  readonly detail: string;

  constructor(detail: string) {
    super(detail);
    this.name = new.target.name;
    this.detail = detail;
  }

  /** Shown on the job: after its last attempt (`final`) or while a retry waits. */
  userMessage(site: string, final: boolean): string {
    return final
      ? `Something went wrong while fetching from ${site}. Please try again.`
      : `Something went wrong while fetching from ${site}. Retrying shortly.`;
  }

  /**
   * Shown on a novel whose update check failed. A scheduled check doesn't retry a novel,
   * so this mentions no attempts: the next check tries again.
   */
  updateMessage(site: string): string {
    return `Something went wrong while checking ${site} for new chapters.`;
  }
}

/** DNS failure, timeout, connection error or HTTP 5xx. */
export class NetworkError extends ScrapeError {
  override readonly type = 'network_error';

  override userMessage(site: string, final: boolean): string {
    return final
      ? `We couldn't reach ${site} after several attempts. Please try again later.`
      : `We couldn't reach ${site}. Retrying shortly.`;
  }

  override updateMessage(site: string): string {
    return `We couldn't reach ${site} to check for new chapters.`;
  }
}

/** HTTP 429 or 403, a challenge page, or another sign the site is limiting requests. */
export class RateLimited extends ScrapeError {
  override readonly type = 'rate_limited';

  /** Milliseconds the site asked us to wait, when it said. */
  readonly retryAfter: number | null;

  constructor(detail: string, retryAfter: number | null = null) {
    super(detail);
    this.retryAfter = retryAfter;
  }

  override userMessage(site: string, final: boolean): string {
    return final
      ? `${site} is limiting requests right now. Try again in a few minutes.`
      : `${site} is limiting requests right now. Retrying in a few minutes.`;
  }

  override updateMessage(site: string): string {
    return `${site} was limiting requests when we checked for new chapters.`;
  }
}

/**
 * A site refused a whole-novel fetch over and over, through ever longer cooldowns. Not
 * retried: the job has already waited hours, and asking again soon would only look more
 * like a bot. Asking again later resumes where it stopped.
 */
export class KeptRefusing extends RateLimited {
  override readonly retryable = false;

  override userMessage(site: string): string {
    return (
      `${site} kept refusing requests, so fetching stopped. The chapters fetched so far ` +
      'are kept; try again in a few hours for the rest.'
    );
  }
}

/** A required element or field is missing from the site's answer. */
export class StructureChanged extends ScrapeError {
  override readonly type = 'structure_changed';

  override userMessage(site: string, final: boolean): string {
    return final
      ? `${site} changed its page layout, so we couldn't read it. The ${site} adapter needs an update.`
      : `${site} returned a page we couldn't read. Retrying shortly.`;
  }

  override updateMessage(site: string): string {
    return (
      `${site} changed its page layout, so we couldn't read the chapter list. ` +
      `The ${site} adapter needs an update.`
    );
  }
}

export class UnknownError extends ScrapeError {}

/** A failure that retrying can't fix. It fails the job at once, with its own message. */
export class PermanentError extends ScrapeError {
  override readonly retryable = false;

  readonly reason: string;

  constructor(detail: string, reason: string) {
    super(detail);
    this.reason = reason;
  }

  override userMessage(): string {
    return this.reason;
  }

  override updateMessage(): string {
    return this.reason;
  }
}

/** The site shows this only to signed-in readers, and the app isn't signed in there. */
export class SignInRequired extends PermanentError {}

/** Not an address any adapter handles, or not a novel page of a supported site. */
export class UnsupportedUrl extends PermanentError {}

/** The job can't be processed: its payload is incomplete, or its chapter is gone. */
export class InvalidJob extends PermanentError {
  constructor(detail: string) {
    super(detail, "This job can't be processed. Please try again.");
  }
}

/** The novel (or chapter) the job writes about was deleted while it ran. */
export class NovelDeleted extends PermanentError {
  constructor(detail: string) {
    super(detail, 'This novel was deleted from your library.');
  }
}

/** Any error thrown while running a job, as a scrape error. */
export function classify(error: unknown): ScrapeError {
  if (error instanceof ScrapeError) return error;
  if (isForeignKeyViolation(error)) {
    // A row the job writes about is gone: its novel was deleted meanwhile.
    return new NovelDeleted(describe(error));
  }
  return new UnknownError(describe(error));
}

/** An error with its stack, capped for `error_detail`. */
export function describe(error: unknown): string {
  const text =
    error instanceof Error ? (error.stack ?? `${error.name}: ${error.message}`) : String(error);
  return text.length > MAX_DETAIL_LENGTH
    ? `${text.slice(0, MAX_DETAIL_LENGTH - 20)}\n... (truncated)`
    : text;
}
