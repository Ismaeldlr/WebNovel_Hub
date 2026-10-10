import type { Queryable } from '../db/database.js';
import { parseJson } from '../db/values.js';
import type { EpubChapterText } from '../epub/writer.js';

/** The novel as its EPUB describes it. */
export interface NovelToExport {
  id: string;
  source: string;
  sourceName: string;
  /** The novel's page on its site, or `epub:sha256:…` for an EPUB import. */
  sourceUrl: string;
  title: string;
  author: string | null;
  description: string | null;
  tags: string[];
  hasCover: boolean;
}

export async function findNovelToExport(
  db: Queryable,
  novelId: string,
): Promise<NovelToExport | null> {
  const { rows } = await db.query<
    Omit<NovelToExport, 'tags' | 'hasCover'> & { tags: string; cover_updated_at: string | null }
  >(
    `SELECT n.id, n.source, s.name AS "sourceName", n.source_url AS "sourceUrl", n.title,
            n.author, n.description, n.tags, n.cover_updated_at
     FROM novels n JOIN source_sites s ON s.key = n.source
     WHERE n.id = $1`,
    [novelId],
  );
  const row = rows[0];
  if (!row) return null;
  const { cover_updated_at, tags, ...novel } = row;
  return { ...novel, tags: parseJson<string[]>(tags, []), hasCover: cover_updated_at !== null };
}

/** Up to `limit` stored chapters after chapter number `after`, in reading order. */
export async function readStoredChapters(
  db: Queryable,
  novelId: string,
  after: number,
  limit: number,
): Promise<EpubChapterText[]> {
  const { rows } = await db.query<EpubChapterText>(
    `SELECT c.number, c.title, t.content
     FROM chapters c JOIN chapter_contents t ON t.chapter_id = c.id
     WHERE c.novel_id = $1 AND c.number > $2
     ORDER BY c.number
     LIMIT $3`,
    [novelId, after, limit],
  );
  return rows;
}
