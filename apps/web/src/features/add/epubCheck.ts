import { EPUB_MAX_BYTES } from '@webnovel-hub/shared';

/** The checks the core makes first, with its messages. */
export const EPUB_CHECKS = {
  notEpub: 'Choose an EPUB file: its name ends in .epub.',
  tooLarge: 'This file is larger than 50 MB, the most an EPUB can be.',
  empty: 'This file is empty.',
  oneFile: 'Drop one EPUB file at a time.',
} as const;

/** Why this file can't be uploaded, or null when it can. */
export function checkEpubFile(file: File): string | null {
  if (!/\.epub$/i.test(file.name)) return EPUB_CHECKS.notEpub;
  if (file.size > EPUB_MAX_BYTES) return EPUB_CHECKS.tooLarge;
  if (file.size === 0) return EPUB_CHECKS.empty;
  return null;
}
