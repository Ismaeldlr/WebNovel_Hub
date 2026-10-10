import type { ImportConflict, ImportEpubResponse } from '@webnovel-hub/shared';
import type { Database } from '../db/database.js';
import { isUniqueViolation } from '../db/errors.js';
import { newId } from '../db/values.js';
import { EpubError, type ParsedEpub, parseEpub } from '../epub/parser.js';
import { AppError } from '../errors.js';
import { coverMediaType } from '../lib/images.js';
import { insertEpubNovel, novelWordCount } from '../repositories/epub.js';
import { findNovelBySourceUrl, findNovelSummary } from '../repositories/novels.js';

export const EPUB_IMPORT_MESSAGES = {
  inLibrary: 'This EPUB is already in your library.',
} as const;

export interface UploadedEpub {
  /** The file's name, e.g. `My Novel.epub`. */
  name: string;
  bytes: Uint8Array;
}

export interface EpubImportResult {
  status: 201;
  body: ImportEpubResponse;
}

export interface EpubImportService {
  /**
   * Imports an EPUB file. Its SHA-256 identifies it: a file already in the library is a
   * 409 with an ImportConflict. A file that isn't a readable EPUB is a 400 with the reason.
   */
  importEpub(file: UploadedEpub): Promise<EpubImportResult>;
}

/** The SHA-256 of a file, in hex. */
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The file's name without `.epub`, the title of last resort. */
const nameWithoutExtension = (name: string) => name.replace(/\.epub$/i, '');

export function createEpubImportService(db: Database): EpubImportService {
  const conflict = async (sourceUrl: string) => {
    const match = await findNovelBySourceUrl(db, sourceUrl);
    if (!match) return null;
    const data: ImportConflict = match;
    return new AppError(409, EPUB_IMPORT_MESSAGES.inLibrary, { data });
  };

  return {
    async importEpub(file) {
      const hash = await sha256Hex(file.bytes);
      const sourceUrl = `epub:sha256:${hash}`;
      const existing = await conflict(sourceUrl);
      if (existing) throw existing;

      let book: ParsedEpub;
      try {
        book = await parseEpub(file.bytes, { fallbackTitle: nameWithoutExtension(file.name) });
      } catch (error) {
        if (error instanceof EpubError) throw new AppError(400, error.message, { cause: error });
        throw error;
      }

      const novelId = newId();
      try {
        await db.withTransaction((tx) =>
          insertEpubNovel(tx, {
            id: novelId,
            sourceUrl,
            title: book.title,
            author: book.author,
            description: book.description,
            tags: book.tags,
            cover: book.cover && {
              mediaType: coverMediaType(book.cover.extension),
              bytes: book.cover.bytes,
            },
            chapters: book.chapters,
          }),
        );
      } catch (error) {
        // The same file, imported a moment ago in another window.
        if (isUniqueViolation(error, 'novels.source_url')) {
          const raced = await conflict(sourceUrl);
          if (raced) throw raced;
        }
        throw error;
      }

      const [novel, wordCount] = await Promise.all([
        findNovelSummary(db, novelId),
        novelWordCount(db, novelId),
      ]);
      if (!novel) throw new Error(`imported novel ${novelId} not found`);
      return { status: 201, body: { novel, wordCount, duplicate: false } };
    },
  };
}
