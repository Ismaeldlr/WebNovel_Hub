import { describe, expect, it } from 'vitest';
import {
  addedNotice,
  checkFailedNotice,
  downloadedNotice,
  failedNotice,
  newChaptersNotices,
  noticeNumber,
} from './notice.js';

const together = { eachNovel: false, showTitles: true };
const each = { eachNovel: true, showTitles: true };
const hidden = { eachNovel: true, showTitles: false };
const novel = (id: string, title: string, count: number) => ({ id, title, count });

describe('the new-chapters notices', () => {
  it('name a single novel, and list a few of several', () => {
    expect(newChaptersNotices([novel('a', 'The Inn', 5)], together)).toEqual([
      {
        kind: 'new-chapters',
        title: 'New chapters',
        body: '5 new chapters of The Inn.',
        novelId: 'a',
      },
    ]);
    expect(newChaptersNotices([novel('a', 'A', 1), novel('b', 'B', 11)], together)[0]!.body).toBe(
      '12 new chapters in 2 novels: A and B.',
    );
    expect(
      newChaptersNotices(
        ['A', 'B', 'C', 'D', 'E'].map((title) => novel(title, title, 1)),
        together,
      )[0]!.body,
    ).toBe('5 new chapters in 5 novels: A, B, C and 2 more.');
  });

  it('give each novel its own when asked, cutting long titles', () => {
    const long = 'Reincarnated as a Sword in a World Where Swords Are Banned Forever';
    expect(newChaptersNotices([novel('a', long, 1), novel('b', 'B', 2)], each)).toEqual([
      {
        kind: 'new-chapters',
        title: 'Reincarnated as a Sword in a World Where Swo…',
        body: '1 new chapter.',
        novelId: 'a',
        tag: 'novel:a',
      },
      { kind: 'new-chapters', title: 'B', body: '2 new chapters.', novelId: 'b', tag: 'novel:b' },
    ]);
  });

  it('keep titles off when asked: one notice with counts only', () => {
    expect(newChaptersNotices([novel('a', 'Secret', 1)], hidden)).toEqual([
      { kind: 'new-chapters', title: 'New chapters', body: '1 new chapter in 1 novel.' },
    ]);
    expect(newChaptersNotices([], each)).toEqual([]);
  });
});

describe('the download and problem notices', () => {
  const inn = { id: 'a', title: 'The Inn' };

  it('say a download or an import finished', () => {
    expect(downloadedNotice(inn, 0, together)).toMatchObject({
      kind: 'downloads',
      body: 'The Inn: every chapter is downloaded, ready to read offline.',
      novelId: 'a',
    });
    expect(downloadedNotice(inn, 3, hidden).body).toBe(
      "A novel: downloaded, but 3 chapters couldn't be.",
    );
    expect(addedNotice({ ...inn, chapters: 1200 }, together).body).toBe(
      'The Inn is in your library, with 1,200 chapters.',
    );
  });

  it('say what stopped, and which novels could not be checked', () => {
    expect(failedNotice('download', inn, 'Royal Road refused.', together)).toMatchObject({
      kind: 'problems',
      title: 'Download stopped',
      body: 'The Inn: Royal Road refused.',
    });
    expect(failedNotice('import', null, 'That page has no novel.', together)).toEqual({
      kind: 'problems',
      title: "Couldn't add the novel",
      body: 'That page has no novel.',
    });
    expect(checkFailedNotice([inn], together).body).toBe('The Inn: its page says what went wrong.');
    expect(checkFailedNotice([inn, { id: 'b', title: 'B' }], hidden).body).toBe(
      '2 novels. Update Jobs says what went wrong.',
    );
  });
});

describe("a notice's number", () => {
  it('is the same for the same tag, so the later notice takes its place', () => {
    const notice = { kind: 'new-chapters' as const, title: 'A', body: 'b', tag: 'novel:a' };
    expect(noticeNumber(notice, 1)).toBe(noticeNumber({ ...notice, body: 'c' }, 2));
    expect(noticeNumber(notice)).not.toBe(noticeNumber({ ...notice, tag: 'novel:b' }));
    expect(noticeNumber(notice)).toBeGreaterThan(0);
    expect(noticeNumber({ ...notice, tag: undefined }, 5)).toBe(5);
  });
});
