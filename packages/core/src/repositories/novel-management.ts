import type { Queryable } from '../db/database.js';
import { queryValues } from '../db/query-values.js';
import { searchKey } from '../db/values.js';

export interface DetailsChanges {
  title?: string;
  author?: string | null;
  description?: string | null;
  tags?: string[];
}

// Column names come only from this allowlist; chapter text is not among them.
const DETAIL_COLUMNS: Record<keyof DetailsChanges, string> = {
  title: 'title',
  author: 'author',
  description: 'description',
  tags: 'tags',
};

/** Changes the novel's own details; chapters and their text are never touched. */
export async function updateNovelDetails(
  tx: Queryable,
  novelId: string,
  changes: DetailsChanges,
): Promise<void> {
  const { values, param } = queryValues([novelId]);
  const assignments = (Object.keys(DETAIL_COLUMNS) as (keyof DetailsChanges)[])
    .filter((key) => changes[key] !== undefined)
    .map((key) => `${DETAIL_COLUMNS[key]} = ${param(changes[key])}`);
  if (assignments.length === 0) return;
  if (changes.title !== undefined)
    assignments.push(`title_key = ${param(searchKey(changes.title))}`);
  if (changes.author !== undefined) {
    assignments.push(`author_key = ${param(searchKey(changes.author))}`);
  }
  await tx.query(`UPDATE novels SET ${assignments.join(', ')} WHERE id = $1`, values);
}

/**
 * Deletes the novel; the database cascades to its chapters, their text, cover, library
 * entry, reading history, NEW markers, jobs and manual update runs. False when there was
 * no such novel.
 */
export async function deleteNovelRow(tx: Queryable, novelId: string): Promise<boolean> {
  const { rowCount } = await tx.query('DELETE FROM novels WHERE id = $1', [novelId]);
  return rowCount === 1;
}
