/**
 * What adapters fetch through. A `SourceSession` offers each way a site may need: a
 * page's HTML (`get`), the site's own JSON endpoints (`getJson`, `postJson`), form or
 * binary posts (`post`, `postBytes`), files (`getBytes`) and pages that only scripts
 * fill in (`render`). Every request waits its turn in one per-host throttle, and HTTP
 * statuses and transport failures become scrape errors here, so adapters deal only with
 * content.
 *
 * The app fetches on behalf of its reader, and only what they asked for: a novel they
 * import, chapters they open or will open next, updates to novels they follow. It never
 * tries to get past CAPTCHAs, challenge pages or other bot protection, and never around
 * logins or paywalls: a challenge counts as `rate_limited` and the job backs off.
 */
import { parse } from 'node-html-parser';
import type { Logger } from '../logger.js';
import { sleep } from '../lib/sleep.js';
import {
  NetworkError,
  PermanentError,
  RateLimited,
  StructureChanged,
  UnknownError,
} from './errors.js';
import type { HttpClient, HttpResponse, PageRenderer } from './http.js';
import { hostOf } from './urls.js';

/** Says who is fetching, so sites can see it and at what rate. */
export const USER_AGENT = 'WebnovelHub/0.1 (personal reading app)';
const REQUEST_TIMEOUT = 30_000;
/** A site's Retry-After is honored up to this long. */
export const MAX_RETRY_AFTER = 3_600_000;

export interface Page {
  /** The final URL, after redirects. */
  url: string;
  status: number;
  text: string;
}

export interface Download {
  url: string;
  contentType: string | null;
  data: Uint8Array;
}

type Headers = Record<string, string>;

/**
 * Keeps at least the host's delay between two requests to it. Shared by every job, so
 * running jobs side by side never raises the rate at which one site is asked. `www.` is
 * ignored: `www.example.com` and `example.com` are one host.
 */
export class HostThrottle {
  private readonly hostDelays: Map<string, number>;
  private readonly nextAllowed = new Map<string, number>();
  private readonly queues = new Map<string, Promise<void>>();
  private readonly logger: Logger | undefined;
  private readonly clock: () => number;
  private readonly pause: typeof sleep;
  private readonly delay: number;

  /** Delays in milliseconds; `hostDelays` raises the delay for particular hosts. */
  constructor(
    delay: number,
    options: {
      hostDelays?: Map<string, number>;
      logger?: Logger;
      clock?: () => number;
      sleep?: typeof sleep;
    } = {},
  ) {
    this.hostDelays = new Map(
      [...(options.hostDelays ?? [])].map(([host, value]) => [
        host.replace(/^www\./, ''),
        Math.max(delay, value),
      ]),
    );
    this.delay = delay;
    this.logger = options.logger;
    this.clock = options.clock ?? Date.now;
    this.pause = options.sleep ?? sleep;
  }

  delayFor(host: string): number {
    return this.hostDelays.get(host.replace(/^www\./, '')) ?? this.delay;
  }

  /** Resolves when a request to `url`'s host may go out. */
  async wait(url: string, signal?: AbortSignal): Promise<void> {
    const host = hostOf(url) ?? url;
    const previous = this.queues.get(host) ?? Promise.resolve();
    let done!: () => void;
    const turn = new Promise<void>((resolve) => (done = resolve));
    this.queues.set(
      host,
      previous.then(() => turn),
    );
    try {
      await previous;
      const wait = (this.nextAllowed.get(host) ?? 0) - this.clock();
      if (wait > 0) {
        this.logger?.debug({ host, waitMs: wait }, 'waiting for the site');
        await this.pause(wait, signal);
      }
      this.nextAllowed.set(host, this.clock() + this.delayFor(host));
    } finally {
      done();
    }
  }
}

/** Milliseconds from a Retry-After header (seconds or an HTTP date), or null. */
export function parseRetryAfter(value: string | undefined, now = Date.now()): number | null {
  const text = value?.trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text) * 1000;
  const when = Date.parse(text);
  return Number.isNaN(when) ? null : Math.max(0, when - now);
}

/** Throws the scrape error an HTTP status stands for; returns when the answer is usable. */
export function checkStatus(url: string, status: number, headers: Headers): void {
  const challenged = headers['cf-mitigated'] === 'challenge';
  if (status < 400 && !challenged) return;
  const retryAfter = parseRetryAfter(headers['retry-after']);
  if (challenged || status === 403 || status === 429 || (status === 503 && retryAfter !== null)) {
    const reason = challenged ? 'challenge page' : `HTTP ${status}`;
    throw new RateLimited(`${reason} from ${url}`, retryAfter);
  }
  if (status >= 500) throw new NetworkError(`HTTP ${status} from ${url}`);
  throw new UnknownError(`HTTP ${status} from ${url}`);
}

function decodeText(response: HttpResponse): string {
  const charset = /charset\s*=\s*"?([\w-]+)/i.exec(response.headers['content-type'] ?? '')?.[1];
  try {
    return new TextDecoder(charset ?? 'utf-8').decode(response.body);
  } catch {
    return new TextDecoder().decode(response.body); // a label TextDecoder doesn't know
  }
}

function decodeJson(url: string, response: HttpResponse): unknown {
  const text = decodeText(response);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // An endpoint answering with something else (often an HTML error page) means the
    // site changed how it works.
    throw new StructureChanged(`${url} did not return JSON: ${JSON.stringify(text.slice(0, 200))}`);
  }
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The fetching tools every job shares: the platform's client and the throttle. */
export interface Fetcher {
  http: HttpClient;
  throttle: HostThrottle;
  renderer?: PageRenderer | undefined;
}

/** The reader's choices that change what an adapter fetches. */
export interface SessionOptions {
  /** WTR Lab: locked AI chapters come in the site's machine translation instead. */
  wtrLabMachineTranslation?: boolean;
}

/**
 * One job's way to the web. Requests stop with the signal's reason once it is aborted
 * (the job timed out or was cancelled).
 */
export class SourceSession {
  private readonly pages = new Map<string, Page>();
  private readonly fetcher: Fetcher;
  private readonly signal: AbortSignal | undefined;
  readonly options: SessionOptions;

  constructor(fetcher: Fetcher, signal?: AbortSignal, options: SessionOptions = {}) {
    this.fetcher = fetcher;
    this.signal = signal;
    this.options = options;
  }

  /** Whether pages that need their scripts can be loaded on this platform. */
  get canRender(): boolean {
    return this.fetcher.renderer !== undefined;
  }

  /**
   * A page's HTML. With `reuse`, a page this session fetched already is returned again
   * instead of being asked for twice (one novel page for metadata and chapter list).
   */
  async get(url: string, options: { headers?: Headers; reuse?: boolean } = {}): Promise<Page> {
    const cached = options.reuse ? this.pages.get(url) : undefined;
    if (cached) return cached;
    const response = await this.request('GET', url, options.headers);
    const page = { url: response.url, status: response.status, text: decodeText(response) };
    this.pages.set(url, page);
    return page;
  }

  /** One of the site's JSON endpoints, decoded. */
  async getJson(url: string, headers?: Headers): Promise<unknown> {
    return decodeJson(url, await this.request('GET', url, headers));
  }

  /** Posts `payload` as JSON to one of the site's endpoints; the answer decoded. */
  async postJson(url: string, payload: unknown, headers?: Headers): Promise<unknown> {
    const body = JSON.stringify(payload);
    const sent = { 'Content-Type': 'application/json', ...headers };
    return decodeJson(url, await this.request('POST', url, sent, body));
  }

  /** Posts a form (or nothing) to an endpoint that answers with HTML. */
  async post(url: string, options: { form?: Headers; headers?: Headers } = {}): Promise<Page> {
    const form = options.form ? new URLSearchParams(options.form).toString() : '';
    const headers = options.form
      ? { 'Content-Type': 'application/x-www-form-urlencoded', ...options.headers }
      : options.headers;
    const response = await this.request('POST', url, headers, form);
    return { url: response.url, status: response.status, text: decodeText(response) };
  }

  /** Posts a binary body (such as a gRPC-web message); the binary answer. */
  async postBytes(url: string, body: Uint8Array, headers?: Headers): Promise<Uint8Array> {
    return (await this.request('POST', url, headers, body)).body;
  }

  /** A file such as a cover, refused when it is over `maxBytes`. */
  async getBytes(url: string, maxBytes: number): Promise<Download> {
    const response = await this.request('GET', url);
    const declared = response.headers['content-length'] ?? '';
    if (/^\d+$/.test(declared) && Number(declared) > maxBytes) {
      throw new UnknownError(`${url} is ${declared} bytes, over ${maxBytes}`);
    }
    if (response.body.length > maxBytes) {
      throw new UnknownError(`${url} is over ${maxBytes} bytes`);
    }
    return {
      url: response.url,
      contentType: response.headers['content-type'] ?? null,
      data: response.body,
    };
  }

  /**
   * A page as a web view shows it once its scripts ran. When `waitFor` doesn't appear in
   * time, the site counts as changed, or as limiting requests when `challenge` is there
   * instead: a check the web view didn't pass on its own. `reuse` works as for `get`. With
   * `webViewAgent`, the web view introduces itself as the browser it is, for sites that
   * only answer browsers.
   */
  async render(
    url: string,
    options: {
      waitFor?: string;
      challenge?: string;
      timeout?: number;
      reuse?: boolean;
      webViewAgent?: boolean;
    } = {},
  ): Promise<Page> {
    const cached = options.reuse ? this.pages.get(url) : undefined;
    if (cached) return cached;
    const renderer = this.fetcher.renderer;
    if (!renderer) {
      throw new PermanentError(
        `no page renderer on this platform for ${url}`,
        "Chapters from this site can't be fetched on this device yet.",
      );
    }
    this.signal?.throwIfAborted();
    await this.fetcher.throttle.wait(url, this.signal);
    let page: { url: string; status: number; html: string };
    try {
      page = await renderer.render({
        url,
        timeout: options.timeout ?? REQUEST_TIMEOUT,
        ...(options.webViewAgent ? {} : { userAgent: USER_AGENT }),
        ...(options.waitFor === undefined ? {} : { waitFor: options.waitFor }),
      });
    } catch (error) {
      throw new NetworkError(`could not load ${url}: ${message(error)}`);
    }
    this.signal?.throwIfAborted();
    checkStatus(url, page.status, {});
    if (options.waitFor) {
      const shown = parse(page.html);
      if (!shown.querySelector(options.waitFor)) {
        if (options.challenge && shown.querySelector(options.challenge)) {
          throw new RateLimited(`${url} showed a challenge that did not pass on its own`);
        }
        throw new StructureChanged(`${JSON.stringify(options.waitFor)} did not appear on ${url}`);
      }
    }
    const rendered = { url: page.url, status: page.status, text: page.html };
    this.pages.set(url, rendered);
    return rendered;
  }

  private async request(
    method: 'GET' | 'POST',
    url: string,
    headers: Headers = {},
    body?: string | Uint8Array,
  ): Promise<HttpResponse> {
    this.signal?.throwIfAborted();
    await this.fetcher.throttle.wait(url, this.signal);
    let response: HttpResponse;
    try {
      response = await this.fetcher.http.request({
        url,
        method,
        headers: { 'User-Agent': USER_AGENT, ...headers },
        timeout: REQUEST_TIMEOUT,
        ...(body === undefined ? {} : { body }),
      });
    } catch (error) {
      throw new NetworkError(`could not fetch ${url}: ${message(error)}`);
    }
    this.signal?.throwIfAborted();
    checkStatus(url, response.status, response.headers);
    return response;
  }
}
