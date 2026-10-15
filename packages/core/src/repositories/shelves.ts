import type { Shelf } from '@webnovel-hub/shared';
import type { Queryable } from '../db/database.js';

const SHELF_COLUMNS = `s.id, s.name,
  (SELECT count(*) FROM shelf_novels sn JOIN library_entries e ON e.novel_id = sn.novel_id
   WHERE sn.shelf_id = s.id AND e.hidden = 0) AS novels`;

/** Every shelf in the reader's order, with its novels counted (hidden ones left out). */
export async function listShelves(db: Queryable): Promise<Shelf[]> {
  const { rows } = await db.query<Shelf>(
    `SELECT ${SHELF_COLUMNS} FROM shelves s ORDER BY s.position, s.created_at, s.id`,
  );
  return rows;
}

export async function findShelf(db: Queryable, id: string): Promise<Shelf | null> {
  const { rows } = await db.query<Shelf>(`SELECT ${SHELF_COLUMNS} FROM shelves s WHERE s.id = $1`, [
    id,
  ]);
  return rows[0] ?? null;
}

export async function countShelves(db: Queryable): Promise<number> {
  const { rows } = await db.query<{ count: number }>('SELECT count(*) AS count FROM shelves');
  return rows[0]?.count ?? 0;
}

/** A new shelf, last in the order; resolves to its id. */
export async function insertShelf(db: Queryable, name: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO shelves (name, position)
     VALUES ($1, (SELECT coalesce(max(position) + 1, 0) FROM shelves))
     RETURNING id`,
    [name],
  );
  if (!rows[0]) throw new Error('insertShelf: no row returned');
  return rows[0].id;
}

/** False when there is no such shelf. */
export async function renameShelf(db: Queryable, id: string, name: string): Promise<boolean> {
  const { rowCount } = await db.query('UPDATE shelves SET name = $2 WHERE id = $1', [id, name]);
  return rowCount === 1;
}

/** False when there is no such shelf. Its novels stay in the library. */
export async function deleteShelf(db: Queryable, id: string): Promise<boolean> {
  const { rowCount } = await db.query('DELETE FROM shelves WHERE id = $1', [id]);
  return rowCount === 1;
}

/** Puts the shelves `ids` first, in that order; the others keep theirs after them. */
export async function orderShelves(db: Queryable, ids: string[]): Promise<void> {
  await db.query(
    `UPDATE shelves
     SET position = CASE
       WHEN id IN (SELECT value FROM json_each($1))
         THEN (SELECT key FROM json_each($1) WHERE value = shelves.id)
       ELSE json_array_length($1) + position END`,
    [ids],
  );
}

/** Of `ids`, those that are shelves. */
export async function existingShelves(db: Queryable, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const { rows } = await db.query<{ id: string }>(
    'SELECT id FROM shelves WHERE id IN (SELECT value FROM json_each($1))',
    [ids],
  );
  return rows.map((row) => row.id);
}

/** Puts the novel on exactly the shelves `ids` (all of them existing shelves). */
export async function setNovelShelves(db: Queryable, novelId: string, ids: string[]) {
  await db.query(
    `DELETE FROM shelf_novels
     WHERE novel_id = $1 AND shelf_id NOT IN (SELECT value FROM json_each($2))`,
    [novelId, ids],
  );
  await db.query(
    `INSERT INTO shelf_novels (shelf_id, novel_id)
     SELECT value, $1 FROM json_each($2) WHERE true
     ON CONFLICT (shelf_id, novel_id) DO NOTHING`,
    [novelId, ids],
  );
}
