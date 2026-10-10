import type { SqlDriver } from './database.js';

const files = import.meta.glob<string>('./migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** The migrations in order: `0001_init.sql` is version 1. */
export const MIGRATIONS = Object.entries(files)
  .map(([path, sql]) => ({ version: Number(/(\d+)_[^/]*\.sql$/.exec(path)?.[1]), path, sql }))
  .sort((a, b) => a.version - b.version);

/** The schema version this code expects. */
export const SCHEMA_VERSION = MIGRATIONS.at(-1)?.version ?? 0;

/** Applies the migrations the database hasn't had yet, each in its own transaction. */
export async function migrate(driver: SqlDriver): Promise<void> {
  const { rows } = await driver.run('PRAGMA user_version', [], true);
  const current = Number(rows[0]?.user_version ?? 0);
  if (current > SCHEMA_VERSION) {
    throw new Error(
      `This library was saved by a newer version of the app (schema ${current}); update the app to open it.`,
    );
  }
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    await driver.exec('BEGIN;');
    try {
      await driver.exec(migration.sql);
      await driver.exec(`PRAGMA user_version = ${migration.version};`);
      await driver.exec('COMMIT;');
    } catch (error) {
      await driver.exec('ROLLBACK;');
      throw error;
    }
  }
}
