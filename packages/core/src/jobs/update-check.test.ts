import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ExampleAdapter,
  chapterUrl,
  exampleRunner,
  finishedJob,
  novelUrl,
  serveNovel,
} from '../../test/example-site.js';
import { insertNovel } from '../../test/catalog.js';
import { openTestDatabase } from '../../test/database.js';
import { FakeSite } from '../../test/sites.js';
import type { Database } from '../db/database.js';
import { enqueueManualUpdateCheck } from '../repositories/updates.js';
import type { ChapterRef } from '../scraper/adapters/base.js';
import type { Notice } from '../scraper/http.js';
import { RoyalRoadAdapter } from '../scraper/adapters/royal-road/index.js';
import { StructureChanged } from '../scraper/errors.js';
import type { JobRunner } from './runner.js';
import { scheduleDueRun } from './scheduler.js';
import { newChapters } from './update-check.js';

let db: Database;
let site: FakeSite;
let runner: JobRunner;
let notices: Notice[];

beforeEach(async () => {
  db = await openTestDatabase();
  site = new FakeSite();
  ({ runner, notices } = await exampleRunner(db, site));
  await runner.start();
});
afterEach(async () => {
  await runner.stop();
  await db.close();
});

/** A novel of the example site with `stored` of its chapters already in the library. */
const stored = (id: number, chapters: number, status = 'reading') =>
  insertNovel(db, {
    source: 'example',
    sourceUrl: novelUrl(id),
    title: `Novel ${id}`,
    chapters,
  }).then(async (novel) => {
    await db.query(`UPDATE chapters SET source_url = $2 || '/' || number WHERE novel_id = $1`, [
      novel.id,
      novelUrl(id),
    ]);
    await db.query('UPDATE library_entries SET status = $2 WHERE novel_id = $1', [
      novel.id,
      status,
    ]);
    return novel;
  });

async function checkNow(novelId: string) {
  const { runId } = await db.withTransaction((tx) =>
    enqueueManualUpdateCheck(tx, { novelId, maxRetries: 0 }),
  );
  runner.wake();
  const { rows } = await db.query<{ id: string }>(
    'SELECT id FROM scrape_jobs WHERE update_run_id = $1',
    [runId],
  );
  return finishedJob(db, rows[0]!.id);
}

const novelRow = async (id: string) =>
  (await db.query<Record<string, unknown>>('SELECT * FROM novels WHERE id = $1', [id])).rows[0]!;

describe('a manual check', () => {
  it('stores the chapters the site added, as new', async () => {
    const novel = await stored(1, 2);
    serveNovel(site, 1, 4);
    const job = await checkNow(novel.id);
    expect(job).toMatchObject({ status: 'completed', result: '{"new_chapters":2}' });
    const { rows } = await db.query<{ number: number; source_url: string; is_new: number }>(
      `SELECT c.number, c.source_url, EXISTS (SELECT 1 FROM new_chapters n WHERE n.chapter_id = c.id) AS is_new
       FROM chapters c WHERE novel_id = $1 ORDER BY number`,
      [novel.id],
    );
    expect(rows.map((row) => [row.number, row.source_url, row.is_new])).toEqual([
      [1, chapterUrl(1, 1), 0],
      [2, chapterUrl(1, 2), 0],
      [3, chapterUrl(1, 3), 1],
      [4, chapterUrl(1, 4), 1],
    ]);
    expect(await novelRow(novel.id)).toMatchObject({
      total_chapters: 4,
      latest_chapter_at: '2026-01-04T00:00:00.000Z',
      last_checked_at: expect.any(String),
    });
  });

  it('finds nothing new the second time', async () => {
    const novel = await stored(1, 2);
    serveNovel(site, 1, 3);
    await checkNow(novel.id);
    expect(await checkNow(novel.id)).toMatchObject({
      status: 'completed',
      result: '{"new_chapters":0}',
    });
  });

  it('flags the novel when the check fails, until a check succeeds', async () => {
    const novel = await stored(1, 2);
    const failed = await checkNow(novel.id); // the site has no such novel: 404
    expect(failed).toMatchObject({ status: 'failed', error_type: 'unknown' });
    expect(await novelRow(novel.id)).toMatchObject({
      update_failed: 1,
      update_error_message: 'Something went wrong while checking Example for new chapters.',
    });

    serveNovel(site, 1, 2);
    await checkNow(novel.id);
    expect(await novelRow(novel.id)).toMatchObject({
      update_failed: 0,
      update_error_message: null,
    });
  });
});

describe('a scheduled run', () => {
  async function runScheduled() {
    const jobId = await scheduleDueRun(db, { intervalHours: 6, maxRetries: 0 });
    runner.wake();
    return finishedJob(db, jobId!);
  }

  it('checks the novels being read or followed, and carries on past a broken one', async () => {
    const reading = await stored(1, 1, 'reading');
    const broken = await stored(2, 1, 'following');
    const dropped = await stored(3, 1, 'dropped');
    serveNovel(site, 1, 2);
    serveNovel(site, 3, 2);

    const job = await runScheduled();
    expect(job).toMatchObject({
      status: 'completed',
      result: '{"novels_checked":2,"new_chapters":1}',
    });
    expect((await novelRow(reading.id)).total_chapters).toBe(2);
    expect((await novelRow(broken.id)).update_failed).toBe(1);
    expect((await novelRow(dropped.id)).last_checked_at).toBeNull();
    expect(notices).toEqual([
      {
        kind: 'new-chapters',
        title: 'New chapters',
        body: '1 new chapter of Novel 1.',
        novelId: reading.id,
      },
      {
        kind: 'problems',
        title: "Couldn't check for new chapters",
        body: 'Novel 2: its page says what went wrong.',
        novelId: broken.id,
      },
    ]);

    const { rows } = await db.query<{ errors: string }>(
      'SELECT errors FROM update_job_runs WHERE id = $1',
      [job!.update_run_id],
    );
    expect(JSON.parse(rows[0]!.errors)).toEqual([
      expect.objectContaining({ novel_id: broken.id, error_type: 'unknown' }),
    ]);
  });

  it('is due once per interval, and not while one waits', async () => {
    const now = new Date('2026-10-07T12:00:00Z');
    expect(await scheduleDueRun(db, { intervalHours: 6, maxRetries: 0, now })).not.toBeNull();
    await runner.stop();
    expect(await scheduleDueRun(db, { intervalHours: 6, maxRetries: 0, now })).toBeNull(); // waiting
    await db.query(`UPDATE scrape_jobs SET status = 'completed', finished_at = created_at`);
    expect(await scheduleDueRun(db, { intervalHours: 6, maxRetries: 0, now })).toBeNull(); // too soon
    const later = new Date(Date.now() + 7 * 3_600_000);
    expect(
      await scheduleDueRun(db, { intervalHours: 6, maxRetries: 0, now: later }),
    ).not.toBeNull();
  });
});

describe('what a scheduled run tells the reader', () => {
  async function runScheduled() {
    const jobId = await scheduleDueRun(db, { intervalHours: 6, maxRetries: 0 });
    runner.wake();
    return finishedJob(db, jobId!);
  }
  // As if the last run was long ago, so the next one is due and checks every novel.
  const later = async () => {
    await db.query(`UPDATE update_job_runs SET created_at = '2000-01-01T00:00:00.000Z'`);
    await db.query(`UPDATE novels SET last_checked_at = '2000-01-01T00:00:00.000Z'`);
  };

  it("follows each novel's choice: muted ones stay quiet, asked-for ones are checked whatever their status", async () => {
    const muted = await stored(1, 1, 'reading');
    const asked = await stored(2, 1, 'on_hold');
    await db.query('UPDATE library_entries SET notify = 0 WHERE novel_id = $1', [muted.id]);
    await db.query('UPDATE library_entries SET notify = 1 WHERE novel_id = $1', [asked.id]);
    serveNovel(site, 1, 2);
    serveNovel(site, 2, 3);

    expect(await runScheduled()).toMatchObject({ result: '{"novels_checked":2,"new_chapters":3}' });
    expect(notices.map((notice) => notice.body)).toEqual(['2 new chapters of Novel 2.']);
    // Both are NEW in the library, the muted one too.
    const { rows } = await db.query<{ novel_id: string }>(
      'SELECT DISTINCT novel_id FROM new_chapters ORDER BY novel_id',
    );
    expect(rows.map((row) => row.novel_id).sort()).toEqual([muted.id, asked.id].sort());
  });

  it('tells only about the novels picked, one notice each, counting the chapters not opened yet', async () => {
    const picked = await stored(1, 1, 'reading');
    await stored(2, 1, 'following');
    await db.query('UPDATE library_entries SET notify = 1 WHERE novel_id = $1', [picked.id]);
    await db.query(
      `UPDATE reader_preferences SET notify_novels = 'picked', notify_each_novel = 1 WHERE id = 1`,
    );
    serveNovel(site, 1, 2);
    serveNovel(site, 2, 2);
    await runScheduled();
    expect(notices).toEqual([
      {
        kind: 'new-chapters',
        title: 'Novel 1',
        body: '1 new chapter.',
        novelId: picked.id,
        tag: `novel:${picked.id}`,
      },
    ]);

    // Another chapter before the first was opened: the novel's notice says 2.
    serveNovel(site, 1, 3);
    await later();
    await runScheduled();
    expect(notices.at(-1)).toMatchObject({ body: '2 new chapters.', tag: `novel:${picked.id}` });
  });

  it('tells about a broken check once, until the novel is checked fine again', async () => {
    const broken = await stored(1, 1, 'reading');
    await runScheduled();
    await later();
    await runScheduled();
    const problems = () => notices.filter((notice) => notice.kind === 'problems');
    expect(problems()).toHaveLength(1);
    expect((await novelRow(broken.id)).update_failed).toBe(1);

    serveNovel(site, 1, 1);
    await later();
    await runScheduled();
    expect((await novelRow(broken.id)).update_failed).toBe(0);
  });
});

describe('telling new chapters from stored ones', () => {
  const adapter = new ExampleAdapter();
  const refs = (...urls: string[]): ChapterRef[] =>
    urls.map((url) => ({ url, title: url, publishedAt: null }));

  it('takes the chapters not stored yet, in reading order', () => {
    const fresh = newChapters(adapter, ['a/1', 'a/2'], refs('a/1', 'a/2', 'a/3', 'a/4'));
    expect(fresh.map((c) => c.url)).toEqual(['a/3', 'a/4']);
  });

  it('stores an inserted chapter, ignores removed ones and repeats', () => {
    const fresh = newChapters(
      adapter,
      ['a/1', 'a/2', 'a/3'],
      refs('a/1', 'a/1b', 'a/3', 'a/4', 'a/4'),
    );
    expect(fresh.map((c) => c.url)).toEqual(['a/1b', 'a/4']);
  });

  it('refuses a list that shares nothing with the stored chapters', () => {
    expect(() => newChapters(adapter, ['a/1'], refs('b/1', 'b/2'))).toThrow(StructureChanged);
  });

  it('takes the whole list for a novel without chapters', () => {
    expect(newChapters(adapter, [], refs('a/1', 'a/2'))).toHaveLength(2);
  });

  it('knows a renamed Royal Road novel by its chapter ids', () => {
    const royalRoad = new RoyalRoadAdapter();
    const old = 'https://www.royalroad.com/fiction/1/old-name/chapter/10/one';
    const renamed = 'https://www.royalroad.com/fiction/1/new-name/chapter/10/one';
    expect(newChapters(royalRoad, [old], refs(renamed))).toEqual([]);
  });
});
