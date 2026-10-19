import type { NovelStorage } from '@webnovel-hub/shared';
import type { Queryable } from '../db/database.js';
import { bool } from '../db/values.js';

/** The novels with stored chapter text, largest first. Sizes are UTF-8 bytes. */
export async function listNovelStorage(db: Queryable): Promise<NovelStorage[]> {
  const { rows } = await db.query<{
    novel_id: string;
    title: string;
    stored_chapters: number;
    bytes: number;
    can_clear: number;
  }>(
    `SELECT n.id AS novel_id, n.title, COUNT(*) AS stored_chapters,
            SUM(length(CAST(cc.content AS BLOB))) AS bytes,
            n.source_url NOT LIKE 'epub:%' AS can_clear
     FROM chapter_contents cc
     JOIN chapters c ON c.id = cc.chapter_id
     JOIN novels n ON n.id = c.novel_id
     GROUP BY n.id
     ORDER BY bytes DESC, n.title_key`,
  );
  return rows.map((row) => ({
    novelId: row.novel_id,
    title: row.title,
    storedChapters: Number(row.stored_chapters),
    bytes: Number(row.bytes),
    canClear: bool(row.can_clear),
  }));
}

/**
 * Deletes the stored text of a novel's chapters, which then count as not fetched: the
 * novel, its chapter list, progress and history stay. Returns how many chapters lost
 * their text.
 */
export async function deleteStoredText(tx: Queryable, novelId: string): Promise<number> {
  const { rowCount } = await tx.query(
    `DELETE FROM chapter_contents
     WHERE chapter_id IN (SELECT id FROM chapters WHERE novel_id = $1)`,
    [novelId],
  );
  await tx.query(
    `UPDATE chapters SET is_fetched = 0, fetched_at = NULL
     WHERE novel_id = $1 AND is_fetched = 1`,
    [novelId],
  );
  return rowCount;
}

/** Whether a whole-novel download of the novel is waiting or running. */
export async function hasActiveFullFetch(db: Queryable, novelId: string): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM scrape_jobs
     WHERE novel_id = $1 AND type = 'novel_fetch_all' AND status IN ('pending', 'running')
     LIMIT 1`,
    [novelId],
  );
  return rows.length > 0;
}

/** Whether the novel was imported from an EPUB file. */
export async function isEpubNovel(db: Queryable, novelId: string): Promise<boolean> {
  const { rows } = await db.query<{ epub: number }>(
    `SELECT source_url LIKE 'epub:%' AS epub FROM novels WHERE id = $1`,
    [novelId],
  );
  return bool(rows[0]?.epub ?? 0);
}
