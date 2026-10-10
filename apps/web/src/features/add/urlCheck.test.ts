import type { SourceSite } from '@webnovel-hub/shared';
import { describe, expect, it } from 'vitest';
import { checkUrl } from './urlCheck';

const SOURCES: SourceSite[] = [
  {
    key: 'royal_road',
    name: 'Royal Road',
    homeUrl: 'https://www.royalroad.com',
    hosts: ['royalroad.com', 'www.royalroad.com'],
    importable: true,
    inProgress: false,
  },
  {
    key: 'ranobes',
    name: 'Ranobes',
    homeUrl: 'https://ranobes.net',
    hosts: ['ranobes.net'],
    importable: true,
    inProgress: false,
  },
  {
    key: 'retired',
    name: 'Old Site',
    homeUrl: 'https://old.test',
    hosts: ['old.test'],
    importable: false,
    inProgress: false,
  },
  { key: 'epub', name: 'EPUB', homeUrl: null, hosts: [], importable: false, inProgress: false },
];

describe('checkUrl', () => {
  it('names the source of a supported address, whatever the case of its host', () => {
    expect(checkUrl('  https://WWW.RoyalRoad.com/fiction/21220  ', SOURCES)).toEqual({
      kind: 'ready',
      url: 'https://WWW.RoyalRoad.com/fiction/21220',
      source: SOURCES[0],
    });
  });

  it('adds https:// to an address pasted without it', () => {
    expect(checkUrl('ranobes.net/novels/123-a-novel.html', SOURCES)).toMatchObject({
      kind: 'ready',
      url: 'https://ranobes.net/novels/123-a-novel.html',
    });
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['not a url', 'invalid'],
    ['ftp://www.royalroad.com/fiction/1', 'invalid'],
    ['javascript:alert(1)', 'invalid'],
    ['https://user:secret@www.royalroad.com/fiction/1', 'invalid'],
  ])('%j is %s', (input, kind) => {
    expect(checkUrl(input, SOURCES).kind).toBe(kind);
  });

  it('refuses sites without an importable source, pointing to the list of them', () => {
    expect(checkUrl('https://www.example.com/story/1', SOURCES)).toEqual({
      kind: 'unsupported',
      host: 'www.example.com',
      message:
        "Webnovel Hub can't import from www.example.com. The supported sites are listed below.",
    });
    expect(checkUrl('https://old.test/novel/1', SOURCES).kind).toBe('unsupported');
    expect(checkUrl('https://royalroad.com.evil.test/fiction/1', SOURCES).kind).toBe('unsupported');
  });

  it('leaves the decision to the API when the sources are unknown', () => {
    expect(checkUrl('https://anything.test/novel', undefined)).toEqual({
      kind: 'ready',
      url: 'https://anything.test/novel',
      source: null,
    });
  });
});
