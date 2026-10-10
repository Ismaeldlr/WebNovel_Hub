import { EPUB_SOURCE } from '@webnovel-hub/shared';
import type { Database } from '../db/database.js';
import type { Registry } from './adapters/registry.js';

/**
 * Writes the supported sites into `source_sites` (key, name, home page, hosts), so the
 * import form and the site list learn about them from the database, and marks any other
 * web source as no longer importable. Returns the keys of sources that stopped being
 * importable.
 */
export async function publishSources(db: Database, registry: Registry): Promise<string[]> {
  return db.withTransaction(async (tx) => {
    for (const adapter of registry.adapters) {
      await tx.query(
        `INSERT INTO source_sites (key, name, home_url, hosts, importable, in_progress)
         VALUES ($1, $2, $3, $4, 1, $5)
         ON CONFLICT (key) DO UPDATE
           SET name = excluded.name, home_url = excluded.home_url, hosts = excluded.hosts,
               importable = 1, in_progress = excluded.in_progress`,
        [
          adapter.source,
          adapter.name,
          adapter.homeUrl,
          [...adapter.hosts].sort(),
          adapter.inProgress,
        ],
      );
    }
    const { rows } = await tx.query<{ key: string }>(
      `UPDATE source_sites SET importable = 0
       WHERE importable = 1 AND key <> $1 AND key NOT IN (SELECT value FROM json_each($2))
       RETURNING key`,
      [EPUB_SOURCE, registry.adapters.map((adapter) => adapter.source)],
    );
    return rows.map((row) => row.key);
  });
}
