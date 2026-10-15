import type {
  LibraryItem,
  LibraryPage,
  LibraryStats,
  LibraryStatus,
  LibraryTag,
  NovelNotifyChoice,
} from '@webnovel-hub/shared';
import type { Database } from '../db/database.js';
import { AppError } from '../errors.js';
import {
  type LibraryListQuery,
  findLibraryItem,
  libraryStats,
  listLibrary,
  listLibraryTags,
  listNotifyChoices,
  newChaptersCount,
  updateLibraryEntry,
} from '../repositories/library.js';
import { deleteNovelRow } from '../repositories/novel-management.js';
import { existingShelves, setNovelShelves } from '../repositories/shelves.js';
import { SHELF_MESSAGES } from './shelves.js';

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
  /** The novel's own choice about notifications of its new chapters; null drops it. */
  setNotify(novelId: string, notify: boolean | null): Promise<LibraryItem>;
  /** The novels that made their own choice about notifications. */
  notifyChoices(): Promise<NovelNotifyChoice[]>;
  /**
   * Hides the novel from the library's lists (or shows it again). Hiding also drops an
   * "always notify" choice, so a hidden novel is quiet until the reader asks otherwise.
   */
  setHidden(novelId: string, hidden: boolean): Promise<LibraryItem>;
  /** Puts the novel on exactly these shelves. */
  setShelves(novelId: string, shelfIds: string[]): Promise<LibraryItem>;
  stats(): Promise<LibraryStats>;
  /** Every tag in the library, for the tag filter. */
  tags(): Promise<LibraryTag[]>;
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

    async setNotify(novelId, notify) {
      if (!(await updateLibraryEntry(db, novelId, { notify }))) {
        throw new AppError(404, LIBRARY_MESSAGES.notInLibrary);
      }
      return itemOrNotFound(novelId);
    },

    notifyChoices: () => listNotifyChoices(db),

    async setHidden(novelId, hidden) {
      const found = await db.withTransaction(async (tx) => {
        if (!(await updateLibraryEntry(tx, novelId, { hidden }))) return false;
        if (hidden) {
          await tx.query(
            'UPDATE library_entries SET notify = NULL WHERE novel_id = $1 AND notify = 1',
            [novelId],
          );
        }
        return true;
      });
      if (!found) throw new AppError(404, LIBRARY_MESSAGES.notInLibrary);
      return itemOrNotFound(novelId);
    },

    async setShelves(novelId, shelfIds) {
      const ids = [...new Set(shelfIds)];
      await db.withTransaction(async (tx) => {
        if ((await existingShelves(tx, ids)).length !== ids.length) {
          throw new AppError(404, SHELF_MESSAGES.notFound);
        }
        const { rows } = await tx.query('SELECT 1 FROM library_entries WHERE novel_id = $1', [
          novelId,
        ]);
        if (rows.length === 0) throw new AppError(404, LIBRARY_MESSAGES.notInLibrary);
        await setNovelShelves(tx, novelId, ids);
      });
      return itemOrNotFound(novelId);
    },

    stats: () => libraryStats(db),
    tags: () => listLibraryTags(db),
    newChaptersCount: () => newChaptersCount(db),
  };
}
