import { SHELF_LIMITS, type Shelf } from '@webnovel-hub/shared';
import type { Database } from '../db/database.js';
import { isUniqueViolation } from '../db/errors.js';
import { AppError } from '../errors.js';
import {
  countShelves,
  deleteShelf,
  findShelf,
  insertShelf,
  listShelves,
  orderShelves,
  renameShelf,
} from '../repositories/shelves.js';

export const SHELF_MESSAGES = {
  notFound: 'This shelf no longer exists.',
  duplicate: (name: string) => `You already have a shelf called “${name}”.`,
  tooMany: `You can have up to ${SHELF_LIMITS.count} shelves.`,
} as const;

/** The reader's shelves; a novel's own shelves are set through the library. */
export interface ShelfService {
  list(): Promise<Shelf[]>;
  create(name: string): Promise<Shelf>;
  rename(id: string, name: string): Promise<Shelf>;
  /** Its novels stay in the library. */
  remove(id: string): Promise<void>;
  /** Puts the shelves in this order; resolves to all of them. */
  reorder(ids: string[]): Promise<Shelf[]>;
}

export function createShelfService(db: Database): ShelfService {
  const shelfOrNotFound = async (id: string) => {
    const shelf = await findShelf(db, id);
    if (!shelf) throw new AppError(404, SHELF_MESSAGES.notFound);
    return shelf;
  };

  // A second shelf with the same name (ignoring case) is refused.
  const naming = async <T>(name: string, save: () => Promise<T>): Promise<T> => {
    try {
      return await save();
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError(409, SHELF_MESSAGES.duplicate(name));
      throw error;
    }
  };

  return {
    list: () => listShelves(db),

    async create(name) {
      if ((await countShelves(db)) >= SHELF_LIMITS.count) {
        throw new AppError(409, SHELF_MESSAGES.tooMany);
      }
      const id = await naming(name, () => insertShelf(db, name));
      return shelfOrNotFound(id);
    },

    async rename(id, name) {
      const renamed = await naming(name, () => renameShelf(db, id, name));
      if (!renamed) throw new AppError(404, SHELF_MESSAGES.notFound);
      return shelfOrNotFound(id);
    },

    async remove(id) {
      if (!(await deleteShelf(db, id))) throw new AppError(404, SHELF_MESSAGES.notFound);
    },

    async reorder(ids) {
      await orderShelves(db, ids);
      return listShelves(db);
    },
  };
}
