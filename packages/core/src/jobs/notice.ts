import type { Notice } from '../scraper/http.js';

/** "5 new chapters of The Wandering Inn", or "12 new chapters in 3 novels". */
export function newChaptersNotice(updated: { title: string; count: number }[]): Notice {
  const total = updated.reduce((sum, novel) => sum + novel.count, 0);
  const chapters = `${total.toLocaleString('en-US')} new chapter${total === 1 ? '' : 's'}`;
  return {
    title: 'New chapters',
    body:
      updated.length === 1
        ? `${chapters} of ${updated[0]!.title}.`
        : `${chapters} in ${updated.length} novels.`,
  };
}
