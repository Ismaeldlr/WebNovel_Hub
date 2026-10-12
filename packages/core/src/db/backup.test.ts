import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nodeSqliteDriver } from '@webnovel-hub/platform-node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addSource, openTestDatabase } from '../../test/database.js';
import { backupFileName, inspectBackup, summarizeLibrary, writeBackup } from './backup.js';
import { type Database, createDatabase } from './database.js';
import { SCHEMA_VERSION } from './migrate.js';

let folder: string;
let db: Database;

beforeEach(async () => {
  folder = mkdtempSync(join(tmpdir(), 'whub-'));
  db = await openTestDatabase();
  await addSource(db);
  await db.query(
    `INSERT INTO novels (id, source, source_url, title, title_key, author_key)
     VALUES ('n1', 'royal_road', 'https://royal_road.example/fiction/1', 'A Novel', 'a novel', '')`,
  );
  await db.query(`INSERT INTO library_entries (novel_id) VALUES ('n1')`);
  await db.query(
    `INSERT INTO chapters (id, novel_id, number, title, source_url)
     VALUES ('c1', 'n1', 1, 'One', 'https://royal_road.example/fiction/1/1')`,
  );
});
afterEach(async () => {
  await db.close();
  rmSync(folder, { recursive: true, force: true });
});

describe('backups', () => {
  it('are named after the day', () => {
    expect(backupFileName(new Date(2026, 9, 1))).toBe('webnovel-hub-2026-10-01.whub');
  });

  it('copy the library into a file that opens as the same library', async () => {
    const path = join(folder, 'copy.whub');
    await writeBackup(db, path);

    const summary = await inspectBackup(db, path);
    expect(summary).toEqual({ ...(await summarizeLibrary(db)), version: SCHEMA_VERSION });
    expect(summary.novels).toBe(1);

    const copy = await createDatabase(nodeSqliteDriver(path));
    const { rows } = await copy.query<{ title: string }>('SELECT title FROM novels');
    await copy.close();
    expect(rows).toEqual([{ title: 'A Novel' }]);
    // The library is still usable once the backup is detached.
    expect((await db.query('SELECT 1 FROM novels')).rowCount).toBe(1);
  });

  it('refuse files that are not a library', async () => {
    const text = join(folder, 'notes.whub');
    writeFileSync(text, 'just some text, not a database at all, long enough for a header');
    await expect(inspectBackup(db, text)).rejects.toThrow(/isn't a Webnovel Hub backup/);

    const empty = join(folder, 'empty.whub');
    const plain = nodeSqliteDriver(empty);
    await plain.exec('CREATE TABLE notes (body TEXT);');
    await plain.close();
    await expect(inspectBackup(db, empty)).rejects.toThrow(/isn't a Webnovel Hub backup/);
  });

  it('refuse a library from a newer version of the app', async () => {
    const path = join(folder, 'newer.whub');
    await writeBackup(db, path);
    const newer = nodeSqliteDriver(path);
    await newer.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1};`);
    await newer.close();
    await expect(inspectBackup(db, path)).rejects.toThrow(/newer version/);
  });
});
