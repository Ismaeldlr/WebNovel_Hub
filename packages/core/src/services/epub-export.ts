import { EPUB_SOURCE, epubFileName } from '@webnovel-hub/shared';
import type { Database } from '../db/database.js';
import { type EpubChapterText, epubFiles } from '../epub/writer.js';
import { zipStream } from '../epub/zip-writer.js';
import { AppError } from '../errors.js';
import { imageType } from '../lib/images.js';
import { findCover } from '../repositories/covers.js';
import { findNovelToExport, readStoredChapters } from '../repositories/epub-export.js';
import { countStoredChapters } from '../repositories/full-fetch.js';
import { CATALOG_MESSAGES } from './catalog.js';

export const EPUB_EXPORT_MESSAGES = {
  nothingStored:
    'No chapter of this novel is stored yet. Fetch its chapters first, then export it.',
} as const;

/** Chapters read from the database at a time while the file is written. */
const CHAPTER_BATCH = 100;

export interface EpubExport {
  fileName: string;
  /** The EPUB file, produced as it is read. */
  content: AsyncGenerator<Uint8Array>;
}

export interface EpubExportService {
  /**
   * A novel's stored chapters as an EPUB file: 404 for an unknown novel, 409 when none
   * of its chapters is stored. Chapters not stored are left out, and the title page says
   * which.
   */
  exportNovel(novelId: string): Promise<EpubExport>;
}

export function createEpubExportService(db: Database): EpubExportService {
  async function* storedChapters(novelId: string): AsyncGenerator<EpubChapterText> {
    let after = 0;
    for (;;) {
      const batch = await readStoredChapters(db, novelId, after, CHAPTER_BATCH);
      yield* batch;
      const last = batch.at(-1);
      if (!last || batch.length < CHAPTER_BATCH) return;
      after = last.number;
    }
  }

  async function coverOf(novelId: string) {
    const stored = await findCover(db, novelId);
    const extension = stored && imageType(stored.bytes);
    return stored && extension ? { bytes: stored.bytes, extension } : null;
  }

  return {
    async exportNovel(novelId) {
      const novel = await findNovelToExport(db, novelId);
      if (!novel) throw new AppError(404, CATALOG_MESSAGES.novelNotFound);
      const chapters = await countStoredChapters(db, novelId);
      if (chapters.stored === 0) throw new AppError(409, EPUB_EXPORT_MESSAGES.nothingStored);

      const exportedAt = new Date();
      const book = {
        id: novel.id,
        title: novel.title,
        author: novel.author,
        description: novel.description,
        tags: novel.tags,
        source:
          novel.source === EPUB_SOURCE ? null : { name: novel.sourceName, url: novel.sourceUrl },
        cover: novel.hasCover ? await coverOf(novelId) : null,
        totalChapters: chapters.total,
        exportedAt,
      };
      return {
        fileName: epubFileName(novel.title),
        content: zipStream(epubFiles(book, storedChapters(novelId)), { modified: exportedAt }),
      };
    },
  };
}
