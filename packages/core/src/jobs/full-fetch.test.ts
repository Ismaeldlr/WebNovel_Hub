import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
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
import type { HttpResponse } from '../scraper/http.js';
import { enqueueFullFetch } from '../repositories/full-fetch.js';
import { Pacing } from './full-fetch.js';
import { claimFullFetch } from './queue.js';
import type { JobRunner } from './runner.js';

describe('pacing', () => {
  it("pauses for the site's pause times its slowdown, plus 10 to 50 %", () => {
    expect(new Pacing(10_000).pause(() => 0)).toBe(11_000);
    expect(new Pacing(10_000, 2).pause(() => 1)).toBe(30_000);
  });

  it('doubles the slowdown and the cooldown with each refusal in a row', () => {
    const pacing = new Pacing(10_000);
    expect([pacing.refused(null), pacing.refused(null), pacing.refused(null)]).toEqual([
      300_000, 600_000, 1_200_000,
    ]);
    expect(pacing.slowdown).toBe(8);
    expect(pacing.refused(7_200_000)).toBe(3_600_000); // Retry-After, up to an hour
  });

  it('gives up after five refusals in a row, and starts counting again after a chapter', () => {
    const pacing = new Pacing(10_000);
    for (let n = 0; n < 4; n += 1) pacing.refused(null);
    pacing.fetched();
    pacing.refused(null);
    expect(pacing.gaveUp).toBe(false);
    for (let n = 0; n < 4; n += 1) pacing.refused(null);
    expect(pacing.gaveUp).toBe(true);
  });

  it('relaxes the slowdown slowly after a long run of chapters', () => {
    const pacing = new Pacing(10_000, 4);
    for (let n = 0; n < 49; n += 1) expect(pacing.fetched()).toBe(false);
    expect(pacing.fetched()).toBe(true);
    expect(pacing.slowdown).toBe(3);
  });
});

let db: Database;
let site: FakeSite;
let runner: JobRunner;
let pauses: number[];

beforeEach(async () => {
  db = await openTestDatabase();
  site = new FakeSite();
  ({ runner, pauses } = await exampleRunner(db, site));
});
afterEach(async () => {
  await runner.stop();
  await db.close();
});

async function novelWith(id: number, chapters: number, fetched: number[] = []) {
  const novel = await insertNovel(db, {
    source: 'example',
    sourceUrl: novelUrl(id),
    chapters,
    fetched,
  });
  await db.query(`UPDATE chapters SET source_url = $2 || '/' || number WHERE novel_id = $1`, [
    novel.id,
    novelUrl(id),
  ]);
  return novel;
}

async function fetchAll(novelId: string) {
  await enqueueFullFetch(db, { novelId, source: 'example', maxRetries: 0 });
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM scrape_jobs WHERE novel_id = $1`,
    [novelId],
  );
  return rows[0]!.id;
}

const storedNumbers = async (novelId: string) =>
  (
    await db.query<{ number: number }>(
      'SELECT number FROM chapters WHERE novel_id = $1 AND is_fetched = 1 ORDER BY number',
      [novelId],
    )
  ).rows.map((row) => row.number);

describe('fetching a whole novel', () => {
  it('fetches every missing chapter in order, pausing between them', async () => {
    serveNovel(site, 1, 4);
    const novel = await novelWith(1, 4, [2]);
    const jobId = await fetchAll(novel.id);
    await runner.start();
    expect(await finishedJob(db, jobId)).toMatchObject({
      status: 'completed',
      result: '{"fetched":3,"failed":0}',
    });
    expect(await storedNumbers(novel.id)).toEqual([1, 2, 3, 4]);
    expect(site.log.map((request) => request.url)).toEqual([1, 3, 4].map((n) => chapterUrl(1, n)));
    // The example site pauses 1 s, plus 30 % (the test's fixed random), between chapters.
    expect(pauses).toEqual([1_300, 1_300]);
  });

  it('cools down when the site refuses, slows the site, and tries the chapter again', async () => {
    serveNovel(site, 1, 3);
    const novel = await novelWith(1, 3);
    let refusals = 1;
    const real = site.request.bind(site);
    site.request = (request) => {
      if (request.url === chapterUrl(1, 2) && refusals-- > 0) {
        return Promise.resolve({
          url: request.url,
          status: 429,
          headers: {},
          body: new Uint8Array(),
        });
      }
      return real(request);
    };
    const jobId = await fetchAll(novel.id);
    await runner.start();
    expect(await finishedJob(db, jobId)).toMatchObject({ status: 'completed' });
    // A pause, the cooldown, the same chapter again at once, then a pause at half the pace.
    expect(pauses).toEqual([1_300, 300_000, 2_600]);
    const { rows } = await db.query<{ fetch_slowdown: number; last_refused_at: string | null }>(
      `SELECT fetch_slowdown, last_refused_at FROM source_sites WHERE key = 'example'`,
    );
    expect(rows[0]).toMatchObject({ fetch_slowdown: 2, last_refused_at: expect.any(String) });
  });

  it('records a chapter that keeps failing and moves on', async () => {
    serveNovel(site, 1, 3);
    site.pages.delete(chapterUrl(1, 2));
    const novel = await novelWith(1, 3);
    const jobId = await fetchAll(novel.id);
    await runner.start();
    expect(await finishedJob(db, jobId)).toMatchObject({ result: '{"fetched":2,"failed":1}' });
    expect(site.requests.get(chapterUrl(1, 2))).toBe(2); // tried twice
    expect(await storedNumbers(novel.id)).toEqual([1, 3]);
  });

  it('stops, keeping what it stored, when the site keeps refusing', async () => {
    serveNovel(site, 1, 3);
    site.add(chapterUrl(1, 2), { body: '', status: 429 });
    const novel = await novelWith(1, 3);
    const jobId = await fetchAll(novel.id);
    await runner.start();
    expect(await finishedJob(db, jobId)).toMatchObject({
      status: 'failed',
      error_type: 'rate_limited',
      error_message: expect.stringContaining('kept refusing'),
    });
    expect(await storedNumbers(novel.id)).toEqual([1]);
  });

  it('waits while whole novels are held, and goes on once they are not', async () => {
    serveNovel(site, 1, 2);
    const novel = await novelWith(1, 2);
    const jobId = await fetchAll(novel.id);
    await runner.holdWholeNovels(true);
    await runner.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(site.log).toEqual([]);
    await runner.holdWholeNovels(false);
    expect(await finishedJob(db, jobId)).toMatchObject({ status: 'completed' });
  });

  it('hands a running fetch back without counting an attempt when held or paused', async () => {
    serveNovel(site, 1, 3);
    // The second chapter's request hangs until the test lets it go.
    let release = () => undefined as void;
    const hung = new Promise<void>((resolve) => (release = resolve));
    const request = site.request.bind(site);
    vi.spyOn(site, 'request').mockImplementation(async (sent) => {
      const response: HttpResponse = await request(sent);
      if (sent.url === chapterUrl(1, 2)) await hung;
      return response;
    });
    const novel = await novelWith(1, 3);
    const jobId = await fetchAll(novel.id);
    await runner.start();
    await vi.waitFor(() => expect(site.requests.get(chapterUrl(1, 2))).toBe(1));

    await runner.pause();
    const { rows } = await db.query('SELECT status, retry_count FROM scrape_jobs WHERE id = $1', [
      jobId,
    ]);
    expect(rows[0]).toEqual({ status: 'pending', retry_count: 0 });
    expect(await storedNumbers(novel.id)).toEqual([1]);

    release();
    runner.resume();
    expect(await finishedJob(db, jobId)).toMatchObject({ status: 'completed', retry_count: 0 });
    expect(await storedNumbers(novel.id)).toEqual([1, 2, 3]);
  });

  it('fetches one novel per site at a time, first come, first served', async () => {
    const first = await novelWith(1, 1);
    const second = await novelWith(2, 1);
    const firstJob = await fetchAll(first.id);
    const secondJob = await fetchAll(second.id);
    await db.query(`UPDATE scrape_jobs SET created_at = '2026-01-01T00:00:00.000Z' WHERE id = $1`, [
      firstJob,
    ]);
    await db.query(`UPDATE scrape_jobs SET created_at = '2026-01-02T00:00:00.000Z' WHERE id = $1`, [
      secondJob,
    ]);
    expect((await claimFullFetch(db))?.id).toBe(firstJob);
    expect(await claimFullFetch(db)).toBeNull();
  });
});
