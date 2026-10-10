import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addSource, openTestDatabase } from '../../test/database.js';
import type { Database } from './database.js';
import { isCheckViolation, isUniqueViolation } from './errors.js';
import { SCHEMA_VERSION } from './migrate.js';

let db: Database;

beforeEach(async () => {
  db = await openTestDatabase();
  await addSource(db);
});
afterEach(() => db.close());

async function addNovel(id = 'n1', sourceUrl = 'https://royal_road.example/fiction/1') {
  await db.query(
    `INSERT INTO novels (id, source, source_url, title, title_key, author_key) VALUES ($1, 'royal_road', $2, 'A Novel', 'a novel', '')`,
    [id, sourceUrl],
  );
  await db.query(`INSERT INTO library_entries (novel_id) VALUES ($1)`, [id]);
  await db.query(
    `INSERT INTO chapters (id, novel_id, number, title, source_url) VALUES ($1, $2, 1, 'One', $3)`,
    [`${id}-c1`, id, `${sourceUrl}/1`],
  );
}

describe('schema', () => {
  it('is at the latest version, with the EPUB source and one preferences row', async () => {
    const { rows } = await db.query<{ user_version: number }>('PRAGMA user_version');
    expect(rows[0]?.user_version).toBe(SCHEMA_VERSION);
    const sources = await db.query<{ key: string }>('SELECT key FROM source_sites ORDER BY key');
    expect(sources.rows.map((r) => r.key)).toEqual(['epub', 'royal_road']);
    const prefs = await db.query('SELECT * FROM reader_preferences');
    expect(prefs.rows).toEqual([
      expect.objectContaining({ id: 1, theme: 'system', font_size: 18 }),
    ]);
  });

  it('migrates an existing database only once', async () => {
    const { rows } = await db.query<{ n: number }>('SELECT count(*) AS n FROM source_sites');
    expect(rows[0]?.n).toBe(2);
  });

  it('deleting a novel removes everything that belongs to it', async () => {
    await addNovel();
    await db.query(
      `INSERT INTO chapter_contents (chapter_id, content, word_count) VALUES ('n1-c1', 'x', 1)`,
    );
    await db.query(
      `INSERT INTO reading_history (novel_id, chapter_id, read_day) VALUES ('n1', 'n1-c1', '2026-10-06')`,
    );
    await db.query(`INSERT INTO new_chapters (novel_id, chapter_id) VALUES ('n1', 'n1-c1')`);
    await db.query(
      `INSERT INTO covers (novel_id, media_type, bytes) VALUES ('n1', 'image/png', $1)`,
      [new Uint8Array([1, 2, 3])],
    );
    await db.query(
      `INSERT INTO scrape_jobs (id, type, novel_id, chapter_id) VALUES ('j1', 'chapter_fetch', 'n1', 'n1-c1')`,
    );

    await db.query(`DELETE FROM novels WHERE id = 'n1'`);

    for (const table of [
      'chapters',
      'chapter_contents',
      'library_entries',
      'reading_history',
      'new_chapters',
      'covers',
      'scrape_jobs',
    ]) {
      const { rows } = await db.query<{ n: number }>(`SELECT count(*) AS n FROM ${table}`);
      expect([table, rows[0]?.n]).toEqual([table, 0]);
    }
  });

  it('rejects a duplicate source URL and a blank title', async () => {
    await addNovel();
    const duplicate = await db
      .query(
        `INSERT INTO novels (id, source, source_url, title, title_key, author_key) VALUES ('n2', 'royal_road', 'https://royal_road.example/fiction/1', 'B', 'b', '')`,
      )
      .catch((error: unknown) => error);
    expect(isUniqueViolation(duplicate, 'novels.source_url')).toBe(true);

    const blank = await db
      .query(
        `INSERT INTO novels (id, source, source_url, title, title_key, author_key) VALUES ('n3', 'royal_road', 'https://royal_road.example/x', ' ', ' ', '')`,
      )
      .catch((error: unknown) => error);
    expect(isCheckViolation(blank, 'novels_title_not_blank')).toBe(true);
  });

  it('allows one active job per dedupe key', async () => {
    await addNovel();
    const insert = (id: string) =>
      db.query(
        `INSERT INTO scrape_jobs (id, type, novel_id, chapter_id, dedupe_key) VALUES ($1, 'chapter_fetch', 'n1', 'n1-c1', 'k')`,
        [id],
      );
    await insert('j1');
    expect(isUniqueViolation(await insert('j2').catch((e: unknown) => e))).toBe(true);
    await db.query(
      `UPDATE scrape_jobs SET status = 'completed', finished_at = '2026-10-06T00:00:00.000Z' WHERE id = 'j1'`,
    );
    await expect(insert('j3')).resolves.toBeDefined();
  });

  it('mirrors a job onto its update run', async () => {
    await addNovel();
    await db.query(
      `INSERT INTO update_job_runs (id, trigger, novel_id) VALUES ('r1', 'manual', 'n1')`,
    );
    await db.query(
      `INSERT INTO scrape_jobs (id, type, novel_id, update_run_id) VALUES ('j1', 'manual_update_check', 'n1', 'r1')`,
    );
    await db.query(
      `UPDATE scrape_jobs SET status = 'running', started_at = '2026-10-06T00:00:00.000Z' WHERE id = 'j1'`,
    );
    const { rows } = await db.query('SELECT status, started_at FROM update_job_runs');
    expect(rows).toEqual([{ status: 'running', started_at: '2026-10-06T00:00:00.000Z' }]);
  });

  it('keeps updated_at current unless the statement sets it', async () => {
    await addNovel();
    await db.query(`UPDATE novels SET updated_at = '2000-01-01T00:00:00.000Z' WHERE id = 'n1'`);
    await db.query(`UPDATE novels SET title = 'Renamed' WHERE id = 'n1'`);
    const { rows } = await db.query<{ updated_at: string }>('SELECT updated_at FROM novels');
    expect((rows[0]?.updated_at ?? '') > '2026').toBe(true);
  });

  it('rolls back a failed transaction', async () => {
    await expect(
      db.withTransaction(async (tx) => {
        await tx.query(
          `INSERT INTO novels (id, source, source_url, title, title_key, author_key) VALUES ('n9', 'royal_road', 'https://x.example/9', 'Nine', 'nine', '')`,
        );
        throw new Error('stop');
      }),
    ).rejects.toThrow('stop');
    const { rows } = await db.query<{ n: number }>('SELECT count(*) AS n FROM novels');
    expect(rows[0]?.n).toBe(0);
  });
});
