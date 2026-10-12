import type { Term } from '@webnovel-hub/shared';
import type { Queryable } from '../db/database.js';

interface TermRow {
  id: string;
  novel_id: string | null;
  novel_title: string | null;
  original: string;
  replacement: string;
  created_at: string;
  updated_at: string;
}

const TERM_SELECT = `
  SELECT t.id, t.novel_id, n.title AS novel_title, t.original, t.replacement,
         t.created_at, t.updated_at
  FROM terms t
  LEFT JOIN novels n ON n.id = t.novel_id`;

// Terms for every novel first, then by novel and original text.
const TERM_ORDER = `ORDER BY t.novel_id IS NOT NULL, n.title_key, t.novel_id,
  t.original COLLATE NOCASE, t.original`;

function toTerm(row: TermRow): Term {
  return {
    id: row.id,
    novel: row.novel_id === null ? null : { id: row.novel_id, title: row.novel_title ?? 'A novel' },
    original: row.original,
    replacement: row.replacement,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Every term. */
export async function listTerms(db: Queryable): Promise<Term[]> {
  const { rows } = await db.query<TermRow>(`${TERM_SELECT} ${TERM_ORDER}`);
  return rows.map(toTerm);
}

/** The terms a novel's chapters use: its own and those for every novel. */
export async function listNovelTerms(db: Queryable, novelId: string): Promise<Term[]> {
  const { rows } = await db.query<TermRow>(
    `${TERM_SELECT} WHERE t.novel_id = $1 OR t.novel_id IS NULL ${TERM_ORDER}`,
    [novelId],
  );
  return rows.map(toTerm);
}

export async function findTerm(db: Queryable, id: string): Promise<Term | null> {
  const { rows } = await db.query<TermRow>(`${TERM_SELECT} WHERE t.id = $1`, [id]);
  return rows[0] ? toTerm(rows[0]) : null;
}

export interface TermFields {
  novelId: string | null;
  original: string;
  replacement: string;
}

/** Adds a term; returns its id. Throws a unique violation for a second term with the same original. */
export async function insertTerm(db: Queryable, fields: TermFields): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO terms (novel_id, original, replacement) VALUES ($1, $2, $3) RETURNING id`,
    [fields.novelId, fields.original, fields.replacement],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('the new term has no id');
  return id;
}

/** Replaces a term's fields. False when there is no such term. */
export async function updateTerm(db: Queryable, id: string, fields: TermFields): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE terms SET novel_id = $2, original = $3, replacement = $4 WHERE id = $1`,
    [id, fields.novelId, fields.original, fields.replacement],
  );
  return rowCount === 1;
}

export async function deleteTerm(db: Queryable, id: string): Promise<boolean> {
  const { rowCount } = await db.query('DELETE FROM terms WHERE id = $1', [id]);
  return rowCount === 1;
}
