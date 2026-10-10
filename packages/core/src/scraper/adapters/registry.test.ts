import { describe, expect, it } from 'vitest';
import { fixture, hasFixtures } from '../../../test/sites.js';
import { UnsupportedUrl } from '../errors.js';
import { GENERIC_SITE_NAME, defaultRegistry } from './registry.js';

const registry = defaultRegistry();

function failure(work: () => unknown): UnsupportedUrl {
  try {
    work();
  } catch (error) {
    if (error instanceof UnsupportedUrl) return error;
    throw error;
  }
  throw new Error('expected UnsupportedUrl');
}

describe('the site registry', () => {
  it('sends an address to its site', () => {
    expect(registry.forUrl('https://www.royalroad.com/fiction/1').source).toBe('royal_road');
    expect(registry.forUrl('https://ranobes.top/novels/1-a.html').source).toBe('ranobes');
  });

  it('names the supported sites when one is not', () => {
    const error = failure(() => registry.forUrl('https://example.com/novel/1'));
    expect(error.userMessage()).toMatch(
      /^This site isn't supported\. Supported sites: Royal Road, /,
    );
    expect(error.retryable).toBe(false);
  });

  it.each(['', 'royalroad.com/fiction/1', 'ftp://royalroad.com/x', 'https://'])(
    'asks for a full address instead of %j',
    (url) => {
      expect(failure(() => registry.forUrl(url)).userMessage()).toContain('full URL');
    },
  );

  it('names sites in messages', () => {
    expect(registry.siteName('https://www.royalroad.com/fiction/1')).toBe('Royal Road');
    expect(registry.siteName('https://example.com/')).toBe(GENERIC_SITE_NAME);
    expect(registry.siteName(null)).toBe(GENERIC_SITE_NAME);
  });

  it('gives every site a distinct key that fits source_sites', () => {
    const keys = registry.adapters.map((adapter) => adapter.source);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^[a-z][a-z0-9_]{1,31}$/);
  });
});

interface UrlCase {
  url: string;
  source?: string;
  canonical?: string;
  unsupported?: boolean;
}

const cases: UrlCase[] = hasFixtures
  ? (JSON.parse(fixture('source_urls.json')) as { cases: UrlCase[] }).cases
  : [];

describe.skipIf(cases.length === 0)('the shared address cases', () => {
  it.each(cases.map((c) => [c.url, c] as const))('%j', (_url, c) => {
    if (c.unsupported) {
      expect(() => registry.forUrl(c.url).canonicalize(c.url)).toThrow(UnsupportedUrl);
      return;
    }
    const adapter = registry.forUrl(c.url);
    const canonical = adapter.canonicalize(c.url);
    expect(canonical).toBe(c.canonical);
    expect(adapter.source).toBe(c.source);
    expect(adapter.canonicalize(canonical)).toBe(canonical); // canonical URLs are fixed points
  });
});
