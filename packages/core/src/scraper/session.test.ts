import { describe, expect, it } from 'vitest';
import { FakeSite, jsonResponse } from '../../test/sites.js';
import { NetworkError, RateLimited, StructureChanged, UnknownError } from './errors.js';
import {
  HostThrottle,
  SourceSession,
  USER_AGENT,
  checkStatus,
  parseRetryAfter,
} from './session.js';

/** A clock that only moves when the throttle sleeps. */
function fakeTime() {
  let now = 0;
  const waits: number[] = [];
  return {
    waits,
    clock: () => now,
    sleep: (ms: number) => {
      waits.push(ms);
      now += ms;
      return Promise.resolve();
    },
  };
}

describe('the per-site throttle', () => {
  it('keeps requests to one site apart, and other sites unaffected', async () => {
    const time = fakeTime();
    const throttle = new HostThrottle(2_000, time);
    await throttle.wait('https://www.royalroad.com/a');
    await throttle.wait('https://royalroad.com/b'); // the same site without www.
    await throttle.wait('https://ranobes.net/c');
    expect(time.waits).toEqual([2_000]);
  });

  it('lines up requests made at the same time', async () => {
    const time = fakeTime();
    const throttle = new HostThrottle(2_000, time);
    await Promise.all([1, 2, 3].map((n) => throttle.wait(`https://example.test/${n}`)));
    expect(time.waits).toEqual([2_000, 2_000]);
  });

  it('gives a site that asks for it a longer delay', async () => {
    const time = fakeTime();
    const throttle = new HostThrottle(2_000, {
      ...time,
      hostDelays: new Map([['www.slow.test', 5_000]]),
    });
    await throttle.wait('https://slow.test/1');
    await throttle.wait('https://slow.test/2');
    expect(time.waits).toEqual([5_000]);
  });
});

describe('statuses', () => {
  it('reads Retry-After in seconds or as a date', () => {
    expect(parseRetryAfter('120')).toBe(120_000);
    expect(
      parseRetryAfter('Wed, 07 Oct 2026 12:01:00 GMT', Date.parse('2026-10-07T12:00:00Z')),
    ).toBe(60_000);
    expect(parseRetryAfter('soon')).toBeNull();
    expect(parseRetryAfter(undefined)).toBeNull();
  });

  it.each([
    [429, {}, RateLimited],
    [403, {}, RateLimited],
    [503, { 'retry-after': '30' }, RateLimited],
    [200, { 'cf-mitigated': 'challenge' }, RateLimited],
    [503, {}, NetworkError],
    [500, {}, NetworkError],
    [404, {}, UnknownError],
  ])('takes HTTP %i %j for a %o', (status, headers, kind) => {
    expect(() => checkStatus('https://x.test/', status, headers)).toThrow(kind);
  });

  it('accepts success and redirects', () => {
    expect(() => checkStatus('https://x.test/', 200, {})).not.toThrow();
    expect(() => checkStatus('https://x.test/', 304, {})).not.toThrow();
  });

  it("keeps the site's Retry-After on the error", () => {
    try {
      checkStatus('https://x.test/', 429, { 'retry-after': '90' });
    } catch (error) {
      expect((error as RateLimited).retryAfter).toBe(90_000);
    }
  });
});

describe('a session', () => {
  it('sends its own User-Agent and decodes the page in its charset', async () => {
    const site = new FakeSite().add('https://x.test/', {
      body: new Uint8Array([0x63, 0x61, 0x66, 0xe9]), // "café" in Latin-1
      contentType: 'text/html; charset=ISO-8859-1',
    });
    const page = await site.session().get('https://x.test/');
    expect(page.text).toBe('café');
    expect(site.log[0]!.headers['User-Agent']).toBe(USER_AGENT);
  });

  it('posts JSON and forms', async () => {
    const site = new FakeSite().add('https://x.test/api', jsonResponse({ ok: true }));
    const session = site.session();
    expect(await session.postJson('https://x.test/api', { a: 1 })).toEqual({ ok: true });
    await session.post('https://x.test/api', { form: { page: '2' } });
    expect(
      site.log.map((request) => [request.method, request.body, request.headers['Content-Type']]),
    ).toEqual([
      ['POST', '{"a":1}', 'application/json'],
      ['POST', 'page=2', 'application/x-www-form-urlencoded'],
    ]);
  });

  it('reports an endpoint that answers something other than JSON as a layout change', async () => {
    const site = new FakeSite().add('https://x.test/api', {
      body: '<html>Down for maintenance</html>',
    });
    await expect(site.session().getJson('https://x.test/api')).rejects.toThrow(StructureChanged);
  });

  it('reports an unreachable site as a network error', async () => {
    const session = new SourceSession({
      http: { request: () => Promise.reject(new Error('getaddrinfo ENOTFOUND x.test')) },
      throttle: new HostThrottle(0),
    });
    await expect(session.get('https://x.test/')).rejects.toThrow(NetworkError);
  });

  it('refuses files over the size limit', async () => {
    const site = new FakeSite().add('https://x.test/cover.jpg', { body: new Uint8Array(100) });
    await expect(site.session().getBytes('https://x.test/cover.jpg', 50)).rejects.toThrow(
      UnknownError,
    );
  });

  it('stops when its job is aborted', async () => {
    const controller = new AbortController();
    const site = new FakeSite().add('https://x.test/', { body: 'x' });
    const session = new SourceSession(
      { http: site, throttle: new HostThrottle(0) },
      controller.signal,
    );
    controller.abort(new NetworkError('timed out'));
    await expect(session.get('https://x.test/')).rejects.toThrow('timed out');
    expect(site.log).toHaveLength(0);
  });
});
