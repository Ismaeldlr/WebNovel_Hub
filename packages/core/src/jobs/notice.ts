// The notifications' words. Pure, so the Android background runner (which has no database)
// builds the same ones as the app.
import type { ReaderPreferences } from '@webnovel-hub/shared';
import type { Notice, NoticeKind } from '../scraper/http.js';

/** How notifications look: one per novel or one for all, with or without titles. */
export interface NoticeStyle {
  eachNovel: boolean;
  showTitles: boolean;
}

export const noticeStyle = (preferences: ReaderPreferences): NoticeStyle => ({
  eachNovel: preferences.notifyEachNovel,
  showTitles: preferences.notifyShowTitles,
});

/** Whether the reader wants notices of this kind. */
export function wantsNotice(preferences: ReaderPreferences, kind: NoticeKind): boolean {
  switch (kind) {
    case 'new-chapters':
      return preferences.notifyNewChapters;
    case 'downloads':
      return preferences.notifyDownloads;
    case 'problems':
      return preferences.notifyProblems;
    case 'test':
      return true;
  }
}

/**
 * The notification's number (Android's id): the same for the same tag, so a later notice
 * replaces it, else a new one each time.
 */
export function noticeNumber(notice: Notice, now = Date.now()): number {
  if (!notice.tag) return now % 2_147_483_647;
  let hash = 0;
  for (const char of notice.tag) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  return hash & 0x7fffffff || 1;
}

/** Long webnovel titles, cut to fit a notification's line. */
const TITLE_MAX = 45;
const short = (title: string) =>
  title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX - 1).trimEnd()}…` : title;

const count = (n: number, noun: string) =>
  `${n.toLocaleString('en-US')} ${noun}${n === 1 ? '' : 's'}`;

/** "A, B and C", or "A, B, C and 2 more" past three. */
function names(titles: string[]): string {
  const shown = titles.slice(0, 3).map(short);
  const more = titles.length - shown.length;
  if (more > 0) return `${shown.join(', ')} and ${more.toLocaleString('en-US')} more`;
  return shown.length === 1 ? shown[0]! : `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}`;
}

/**
 * New chapters: one notice per novel (which a later one for the novel replaces), or one
 * for all, e.g. "5 new chapters of The Wandering Inn" or "12 new chapters in 3 novels:
 * A, B and C". Without titles, always one, with counts only.
 */
export function newChaptersNotices(
  updated: { id: string; title: string; count: number }[],
  style: NoticeStyle = { eachNovel: false, showTitles: true },
): Notice[] {
  if (updated.length === 0) return [];
  const kind = 'new-chapters';
  if (style.eachNovel && style.showTitles) {
    return updated.map((novel) => ({
      kind,
      title: short(novel.title),
      body: `${count(novel.count, 'new chapter')}.`,
      novelId: novel.id,
      tag: `novel:${novel.id}`,
    }));
  }
  const chapters = count(
    updated.reduce((sum, novel) => sum + novel.count, 0),
    'new chapter',
  );
  const only = updated.length === 1 ? updated[0]! : null;
  if (!style.showTitles) {
    return [
      { kind, title: 'New chapters', body: `${chapters} in ${count(updated.length, 'novel')}.` },
    ];
  }
  if (only) {
    return [
      { kind, title: 'New chapters', body: `${chapters} of ${only.title}.`, novelId: only.id },
    ];
  }
  const list = names(updated.map((novel) => novel.title));
  return [
    { kind, title: 'New chapters', body: `${chapters} in ${updated.length} novels: ${list}.` },
  ];
}

/** A whole novel downloaded (`failed` chapters couldn't be). */
export function downloadedNotice(
  novel: { id: string; title: string },
  failed: number,
  style: NoticeStyle,
): Notice {
  const which = style.showTitles ? short(novel.title) : 'A novel';
  return {
    kind: 'downloads',
    title: 'Download finished',
    body:
      failed === 0
        ? `${which}: every chapter is downloaded, ready to read offline.`
        : `${which}: downloaded, but ${count(failed, 'chapter')} couldn't be.`,
    novelId: novel.id,
    tag: `download:${novel.id}`,
  };
}

/** A novel added from its address is in the library. */
export function addedNotice(
  novel: { id: string; title: string; chapters: number },
  style: NoticeStyle,
): Notice {
  const which = style.showTitles ? short(novel.title) : 'A novel you added';
  return {
    kind: 'downloads',
    title: 'Novel added',
    body: `${which} is in your library, with ${count(novel.chapters, 'chapter')}.`,
    novelId: novel.id,
  };
}

/** A whole-novel download or an import that stopped for good. */
export function failedNotice(
  what: 'download' | 'import',
  novel: { id: string; title: string } | null,
  message: string,
  style: NoticeStyle,
): Notice {
  const title = what === 'download' ? 'Download stopped' : "Couldn't add the novel";
  const which = novel && style.showTitles ? `${short(novel.title)}: ` : '';
  return {
    kind: 'problems',
    title,
    body: `${which}${message}`,
    ...(novel ? { novelId: novel.id, tag: `download:${novel.id}` } : {}),
  };
}

/** Novels whose scheduled check started failing. */
export function checkFailedNotice(
  novels: { id: string; title: string }[],
  style: NoticeStyle,
): Notice {
  const only = novels.length === 1 ? novels[0]! : null;
  return {
    kind: 'problems',
    title: "Couldn't check for new chapters",
    body:
      only && style.showTitles
        ? `${short(only.title)}: its page says what went wrong.`
        : style.showTitles
          ? `${names(novels.map((novel) => novel.title))}. Update Jobs says what went wrong.`
          : `${count(novels.length, 'novel')}. Update Jobs says what went wrong.`,
    ...(only ? { novelId: only.id } : {}),
  };
}
