import type { NovelDetail } from '@webnovel-hub/shared';
import type { Database } from '../db/database.js';
import { AppError } from '../errors.js';
import { type CoverExtension, coverMediaType, imageType } from '../lib/images.js';
import { saveCover } from '../repositories/covers.js';
import {
  type DetailsChanges,
  deleteNovelRow,
  updateNovelDetails,
} from '../repositories/novel-management.js';
import { findNovel, novelExists } from '../repositories/novels.js';
import { CATALOG_MESSAGES } from './catalog.js';

export const MANAGEMENT_MESSAGES = {
  coverType: 'Choose a JPG, PNG or WebP image.',
} as const;

// Uploaded covers: a subset of what the scraper stores.
const UPLOADABLE: ReadonlySet<CoverExtension> = new Set(['jpg', 'png', 'webp']);

export interface NovelManagementService {
  /** Changes the novel's details. */
  updateDetails(novelId: string, changes: DetailsChanges): Promise<NovelDetail>;
  /** Replaces the novel's cover with an uploaded image. */
  replaceCover(novelId: string, bytes: Uint8Array): Promise<NovelDetail>;
  /** Deletes the novel with everything that belongs to it. */
  deleteNovel(novelId: string): Promise<void>;
}

export function createNovelManagementService(db: Database): NovelManagementService {
  const detail = async (novelId: string) => {
    const novel = await findNovel(db, novelId);
    if (!novel) throw new AppError(404, CATALOG_MESSAGES.novelNotFound);
    return novel;
  };

  const requireNovel = async (novelId: string) => {
    if (!(await novelExists(db, novelId))) throw new AppError(404, CATALOG_MESSAGES.novelNotFound);
  };

  return {
    async updateDetails(novelId, changes) {
      await requireNovel(novelId);
      await updateNovelDetails(db, novelId, changes);
      return detail(novelId);
    },

    async replaceCover(novelId, bytes) {
      const extension = imageType(bytes);
      if (extension === null || !UPLOADABLE.has(extension)) {
        throw new AppError(400, MANAGEMENT_MESSAGES.coverType);
      }
      await requireNovel(novelId);
      await db.withTransaction((tx) =>
        saveCover(tx, novelId, { mediaType: coverMediaType(extension), bytes }),
      );
      return detail(novelId);
    },

    async deleteNovel(novelId) {
      if (!(await deleteNovelRow(db, novelId))) {
        throw new AppError(404, CATALOG_MESSAGES.novelNotFound);
      }
    },
  };
}
