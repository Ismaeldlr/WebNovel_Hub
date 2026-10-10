import type { Queryable } from '../db/database.js';
import { NOW } from '../db/sql.js';

export type CoverMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

export interface Cover {
  mediaType: CoverMediaType;
  bytes: Uint8Array;
}

/**
 * Stores the novel's cover, replacing any earlier one. `sourceUrl` is where it was
 * downloaded from; an uploaded cover has none.
 */
export async function saveCover(
  db: Queryable,
  novelId: string,
  cover: Cover,
  sourceUrl: string | null = null,
): Promise<void> {
  await db.query(
    `INSERT INTO covers (novel_id, media_type, bytes) VALUES ($1, $2, $3)
     ON CONFLICT (novel_id) DO UPDATE SET media_type = excluded.media_type, bytes = excluded.bytes`,
    [novelId, cover.mediaType, cover.bytes],
  );
  await db.query(
    `UPDATE novels SET cover_updated_at = ${NOW}, cover_source_url = $2 WHERE id = $1`,
    [novelId, sourceUrl],
  );
}

/** The novel's stored cover, or null. */
export async function findCover(db: Queryable, novelId: string): Promise<Cover | null> {
  const { rows } = await db.query<{ media_type: CoverMediaType; bytes: Uint8Array }>(
    'SELECT media_type, bytes FROM covers WHERE novel_id = $1',
    [novelId],
  );
  const row = rows[0];
  return row ? { mediaType: row.media_type, bytes: row.bytes } : null;
}
