import type { LibraryItem, LibraryPage, LibraryStats, LibraryStatus } from '@webnovel-hub/shared';
import type { Database } from '../db/database.js';
import { AppError } from '../errors.js';
import {
  type LibraryListQuery,
  findLibraryItem,
  libraryStats,
  listLibrary,
  newChaptersCount,
  updateLibraryEntry,
} from '../repositories/library.js';
import { deleteNovelRow } from '../repositories/novel-management.js';

export const LIBRARY_MESSAGES = {
  notInLibrary: "This novel isn't in your library.",
} as const;

export interface LibraryService {
  /** The novels matching the filters, in the chosen order, a page at a time. */
  list(query: LibraryListQuery): Promise<LibraryPage>;
  /** Deletes the novel with its chapters, text and history: nothing outside the library stays. */
  remove(novelId: string): Promise<void>;
  setStatus(novelId: string, status: LibraryStatus): Promise<LibraryItem>;
  setFavorite(novelId: string, isFavorite: boolean): Promise<LibraryItem>;
  stats(): Promise<LibraryStats>;
  newChaptersCount(): Promise<number>;
}

export function createLibraryService(db: Database): LibraryService {
  const itemOrNotFound = async (novelId: string) => {
    const item = await findLibraryItem(db, novelId);
    if (!item) throw new AppError(404, LIBRARY_MESSAGES.notInLibrary);
    return item;
  };

  return {
    async list(query) {
      const { items, total } = await listLibrary(db, query);
      return { items, total, page: query.page, limit: query.limit, sort: query.sort };
    },

    async remove(novelId) {
      if (!(await deleteNovelRow(db, novelId))) {
        throw new AppError(404, LIBRARY_MESSAGES.notInLibrary);
      }
    },

    async setStatus(novelId, status) {
      if (!(await updateLibraryEntry(db, novelId, { status }))) {
        throw new AppError(404, LIBRARY_MESSAGES.notInLibrary);
      }
      return itemOrNotFound(novelId);
    },

    async setFavorite(novelId, isFavorite) {
      if (!(await updateLibraryEntry(db, novelId, { isFavorite }))) {
        throw new AppError(404, LIBRARY_MESSAGES.notInLibrary);
      }
      return itemOrNotFound(novelId);
    },

    stats: () => libraryStats(db),
    newChaptersCount: () => newChaptersCount(db),
  };
}
