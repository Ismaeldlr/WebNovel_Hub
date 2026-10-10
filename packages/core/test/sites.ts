// Serves saved site pages to adapters instead of the web: no network, no web view.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { HttpClient, HttpRequest, HttpResponse, PageRenderer } from '../src/scraper/http.js';
import { HostThrottle, SourceSession } from '../src/scraper/session.js';

const FIXTURES = fileURLToPath(new URL('../../../fixtures/scraper/', import.meta.url));

/** The saved pages live only on the development machine; tests that need them skip without. */
export const hasFixtures = existsSync(`${FIXTURES}royal_road`);

export const fixture = (name: string): string => readFileSync(`${FIXTURES}${name}`, 'utf8');

export const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, ...new Array(200).fill(0)]);
export const PNG = new Uint8Array([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  ...new Array(200).fill(0),
]);
export const WEBP = new Uint8Array([
  ...new TextEncoder().encode('RIFF'),
  0,
  0,
  0,
  0,
  ...new TextEncoder().encode('WEBPVP8 '),
  ...new Array(200).fill(0),
]);

export interface FakeResponse {
  body: string | Uint8Array;
  status?: number;
  contentType?: string;
  headers?: Record<string, string>;
}

export const jsonResponse = (data: unknown): FakeResponse => ({
  body: JSON.stringify(data),
  contentType: 'application/json',
});

/** URL → response (HTTP) and URL → HTML (rendered). Unknown URLs answer 404. */
export class FakeSite implements HttpClient, PageRenderer {
  readonly pages = new Map<string, FakeResponse>();
  readonly rendered = new Map<string, string>();
  /** Requests per URL, and the requests themselves in order. */
  readonly requests = new Map<string, number>();
  readonly log: HttpRequest[] = [];
  readonly renders = new Map<string, number>();

  add(url: string, response: FakeResponse): this {
    this.pages.set(url, response);
    return this;
  }

  addFixture(url: string, name: string, contentType?: string): this {
    return this.add(url, { body: fixture(name), ...(contentType ? { contentType } : {}) });
  }

  request(request: HttpRequest): Promise<HttpResponse> {
    this.requests.set(request.url, (this.requests.get(request.url) ?? 0) + 1);
    this.log.push(request);
    const page = this.pages.get(request.url);
    const body = page?.body ?? 'not found';
    return Promise.resolve({
      url: request.url,
      status: page ? (page.status ?? 200) : 404,
      headers: {
        'content-type': page?.contentType ?? 'text/html; charset=utf-8',
        ...page?.headers,
      },
      body: typeof body === 'string' ? new TextEncoder().encode(body) : body,
    });
  }

  render(request: { url: string }): Promise<{ url: string; status: number; html: string }> {
    this.renders.set(request.url, (this.renders.get(request.url) ?? 0) + 1);
    const html = this.rendered.get(request.url);
    return Promise.resolve({ url: request.url, status: html ? 200 : 404, html: html ?? '' });
  }

  /** A session over this site, without pauses between requests. */
  session(): SourceSession {
    return new SourceSession({ http: this, throttle: new HostThrottle(0), renderer: this });
  }
}
