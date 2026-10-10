import type { FullFetchResponse } from './jobs.js';
import type { NovelSummary } from './novels.js';

/**
 * A novel the reader asked to fetch in full: its latest whole-novel fetch and how many
 * chapters are stored. The stored chapters download as an EPUB file from GET /api/novels/:id/epub.
 */
export interface ExportItem extends FullFetchResponse {
  novel: NovelSummary;
}

/** Response of GET /api/exports: the novels most recently asked for first. */
export interface ExportListResponse {
  items: ExportItem[];
}

/** The longest title an EPUB's file name keeps, in characters. */
export const EPUB_FILE_NAME_MAX = 120;

/** Characters that Windows, Android or macOS refuse in a file name. */
const REFUSED = new Set('<>:"/\\|?*');

/**
 * The file name a novel's EPUB is saved under: its title, without the characters file
 * systems refuse, shortened to EPUB_FILE_NAME_MAX characters.
 */
export function epubFileName(title: string): string {
  const cleaned = [...title]
    .map((char) => (char.charCodeAt(0) < 0x20 || char === '\x7f' || REFUSED.has(char) ? ' ' : char))
    .join('')
    .replace(/\s+/g, ' ')
    // Windows drops a trailing dot, and a leading one hides the file.
    .replace(/^[\s.]+|[\s.]+$/g, '');
  const name = [...cleaned].slice(0, EPUB_FILE_NAME_MAX).join('').trimEnd();
  return `${name || 'Novel'}.epub`;
}
