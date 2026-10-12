import type { Term, TermCreate, TermUpdate } from '@webnovel-hub/shared';
import type { Database } from '../db/database.js';
import { isUniqueViolation } from '../db/errors.js';
import { AppError } from '../errors.js';
import { novelExists } from '../repositories/novels.js';
import {
  type TermFields,
  deleteTerm,
  findTerm,
  insertTerm,
  listNovelTerms,
  listTerms,
  updateTerm,
} from '../repositories/terms.js';
import { CATALOG_MESSAGES } from './catalog.js';

export const TERM_MESSAGES = {
  notFound: 'This term no longer exists.',
  duplicateInNovel: (original: string) => `This novel already has a term for “${original}”.`,
  duplicateEverywhere: (original: string) =>
    `There's already a term for “${original}” in every novel.`,
} as const;

export interface TermService {
  /** Every term, those for every novel first. */
  list(): Promise<Term[]>;
  /** The terms a novel's chapters use. */
  listForNovel(novelId: string): Promise<Term[]>;
  create(fields: TermCreate): Promise<Term>;
  update(id: string, changes: TermUpdate): Promise<Term>;
  remove(id: string): Promise<void>;
}

export function createTermService(db: Database): TermService {
  const requireNovel = async (novelId: string | null) => {
    if (novelId !== null && !(await novelExists(db, novelId))) {
      throw new AppError(404, CATALOG_MESSAGES.novelNotFound);
    }
  };

  const termOrNotFound = async (id: string) => {
    const term = await findTerm(db, id);
    if (!term) throw new AppError(404, TERM_MESSAGES.notFound);
    return term;
  };

  // A second term with the same original text in the same place is refused, not merged.
  const saving = async (fields: TermFields, save: () => Promise<unknown>) => {
    try {
      await save();
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      throw new AppError(
        409,
        fields.novelId === null
          ? TERM_MESSAGES.duplicateEverywhere(fields.original)
          : TERM_MESSAGES.duplicateInNovel(fields.original),
      );
    }
  };

  return {
    list: () => listTerms(db),

    async listForNovel(novelId) {
      await requireNovel(novelId);
      return listNovelTerms(db, novelId);
    },

    async create(fields) {
      await requireNovel(fields.novelId);
      let id = '';
      await saving(fields, async () => {
        id = await insertTerm(db, fields);
      });
      return termOrNotFound(id);
    },

    async update(id, changes) {
      const term = await termOrNotFound(id);
      const fields: TermFields = {
        novelId: changes.novelId === undefined ? (term.novel?.id ?? null) : changes.novelId,
        original: changes.original ?? term.original,
        replacement: changes.replacement ?? term.replacement,
      };
      await requireNovel(fields.novelId);
      await saving(fields, () => updateTerm(db, id, fields));
      return termOrNotFound(id);
    },

    async remove(id) {
      if (!(await deleteTerm(db, id))) throw new AppError(404, TERM_MESSAGES.notFound);
    },
  };
}
