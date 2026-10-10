import { nodeSqliteDriver } from '@webnovel-hub/platform-node';
import { createDatabase, type Database } from '../src/db/database.js';

/** A fresh, migrated in-memory database. */
export function openTestDatabase(): Promise<Database> {
  return createDatabase(nodeSqliteDriver(':memory:'));
}

/** Registers a scraped source site, as the adapter registry does at start-up. */
export async function addSource(
  db: Database,
  key = 'royal_road',
  name = 'Royal Road',
): Promise<void> {
  await db.query(
    `INSERT INTO source_sites (key, name, home_url, hosts) VALUES ($1, $2, $3, $4)
     ON CONFLICT (key) DO NOTHING`,
    [key, name, `https://${key}.example`, [`${key}.example`]],
  );
}
