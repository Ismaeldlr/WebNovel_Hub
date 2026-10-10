import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { insertNovel } from '../../test/catalog.js';
import { addSource, openTestDatabase } from '../../test/database.js';
import type { Database } from '../db/database.js';
import {
  KeptRefusing,
  NetworkError,
  RateLimited,
  StructureChanged,
  UnknownError,
  UnsupportedUrl,
} from '../scraper/errors.js';
import {
  type ClaimedJob,
  JobLost,
  claimJob,
  completeJob,
  failJob,
  planFailure,
  releaseJob,
  reportProgress,
  requeueInterrupted,
  retryDelay,
} from './queue.js';

let db: Database;

beforeEach(async () => {
  db = await openTestDatabase();
  await addSource(db);
});
afterEach(() => db.close());

const half = () => 0.5; // no jitter

async function queue(
  type: 'novel_ingestion' | 'chapter_fetch',
  options: {
    priority?: number;
    availableAt?: string;
    createdAt?: string;
    chapter?: [string, string];
  } = {},
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO scrape_jobs (type, priority, payload, novel_id, chapter_id, available_at, created_at)
     VALUES ($1, $2, $3, $4, $5, coalesce($6, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
             coalesce($7, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))
     RETURNING id`,
    [
      type,
      options.priority ?? 5,
      type === 'novel_ingestion'
        ? { url: 'https://www.royalroad.com/fiction/1', source: 'royal_road' }
        : {},
      options.chapter?.[0] ?? null,
      options.chapter?.[1] ?? null,
      options.availableAt ?? null,
      options.createdAt ?? null,
    ],
  );
  return rows[0]!.id;
}

const job = async (id: string) =>
  (await db.query<Record<string, unknown>>('SELECT * FROM scrape_jobs WHERE id = $1', [id]))
    .rows[0]!;

describe('taking jobs', () => {
  it('takes the highest priority first, then the oldest', async () => {
    const low = await queue('novel_ingestion', {
      priority: 5,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const older = await queue('novel_ingestion', {
      priority: 0,
      createdAt: '2026-01-02T00:00:00.000Z',
    });
    const newer = await queue('novel_ingestion', {
      priority: 0,
      createdAt: '2026-01-03T00:00:00.000Z',
    });
    const order = [];
    for (let n = 0; n < 3; n += 1) order.push((await claimJob(db, ['novel_ingestion']))!.id);
    expect(order).toEqual([older, newer, low]);
    expect(await claimJob(db, ['novel_ingestion'])).toBeNull();
  });

  it('names the site the job is about and marks it running', async () => {
    const id = await queue('novel_ingestion');
    const claimed = await claimJob(db, ['novel_ingestion']);
    expect(claimed).toMatchObject({
      id,
      sourceUrl: 'https://www.royalroad.com/fiction/1',
      retryCount: 0,
    });
    expect(await job(id)).toMatchObject({ status: 'running', started_at: expect.any(String) });
  });

  it('leaves jobs whose retry time has not come, and other types', async () => {
    await queue('novel_ingestion', { availableAt: '2999-01-01T00:00:00.000Z' });
    const { chapterIds, id: novelId } = await insertNovel(db, { chapters: 1 });
    await queue('chapter_fetch', { chapter: [novelId, chapterIds[0]!] });
    expect(await claimJob(db, ['novel_ingestion'])).toBeNull();
    expect(await claimJob(db, ['chapter_fetch'])).not.toBeNull();
  });
});

describe('finishing jobs', () => {
  let claimed: ClaimedJob;
  beforeEach(async () => {
    await queue('novel_ingestion');
    claimed = (await claimJob(db, ['novel_ingestion']))!;
  });

  it('records progress and the result', async () => {
    await reportProgress(db, claimed, 'Halfway', 50);
    expect(await job(claimed.id)).toMatchObject({
      progress_message: 'Halfway',
      progress_percent: 50,
    });
    await completeJob(db, claimed, { novel_id: 'x' });
    expect(await job(claimed.id)).toMatchObject({
      status: 'completed',
      progress_percent: 100,
      result: '{"novel_id":"x"}',
      finished_at: expect.any(String),
    });
  });

  it('schedules a retry with backoff while retries remain', async () => {
    const plan = await failJob(db, claimed, new NetworkError('timed out'), 'Royal Road', half);
    expect(plan).toMatchObject({ final: false, delay: 30_000 });
    const row = await job(claimed.id);
    expect(row).toMatchObject({
      status: 'pending',
      retry_count: 1,
      error_type: 'network_error',
      error_message: "We couldn't reach Royal Road. Retrying shortly.",
      progress_message: 'Attempt 1 of 4 failed. Trying again in about 30 seconds.',
    });
    expect(Date.parse(String(row.available_at)) - Date.now()).toBeGreaterThan(25_000);
  });

  it('fails for good with a readable message when the retries are used up', async () => {
    const plan = await failJob(
      db,
      { ...claimed, retryCount: 3 },
      new StructureChanged('gone'),
      'Royal Road',
      half,
    );
    expect(plan.final).toBe(true);
    expect(await job(claimed.id)).toMatchObject({
      status: 'failed',
      error_type: 'structure_changed',
      error_message:
        "Royal Road changed its page layout, so we couldn't read it. The Royal Road adapter needs an update.",
      error_detail: 'gone',
    });
  });

  it('fails at once when retrying cannot help', async () => {
    const error = new UnsupportedUrl('no adapter', "This site isn't supported.");
    expect((await failJob(db, claimed, error, 'x', half)).final).toBe(true);
    expect(await job(claimed.id)).toMatchObject({
      status: 'failed',
      error_message: "This site isn't supported.",
    });
  });

  it('hands a job back without counting an attempt', async () => {
    expect(await releaseJob(db, claimed)).toBe(true);
    expect(await job(claimed.id)).toMatchObject({ status: 'pending', retry_count: 0 });
  });

  it('cannot write to a job that was taken away', async () => {
    await db.query('DELETE FROM scrape_jobs WHERE id = $1', [claimed.id]);
    await expect(reportProgress(db, claimed, 'x', null)).rejects.toThrow(JobLost);
    await expect(completeJob(db, claimed, {})).rejects.toThrow(JobLost);
  });

  it('puts jobs interrupted by the app closing back in the queue', async () => {
    expect(await requeueInterrupted(db)).toBe(1);
    expect(await job(claimed.id)).toMatchObject({
      status: 'pending',
      progress_message: 'Waiting to start…',
    });
  });
});

describe('a chapter that fails for good', () => {
  it('records the failure on the chapter', async () => {
    const { id: novelId, chapterIds } = await insertNovel(db, { chapters: 1 });
    await queue('chapter_fetch', { chapter: [novelId, chapterIds[0]!] });
    const claimed = (await claimJob(db, ['chapter_fetch']))!;
    await failJob(
      db,
      { ...claimed, maxRetries: 0 },
      new UnknownError('HTTP 404'),
      'Royal Road',
      half,
    );
    const { rows } = await db.query(
      'SELECT fetch_error_type, fetch_error_message FROM chapters WHERE id = $1',
      [chapterIds[0]],
    );
    expect(rows[0]).toEqual({
      fetch_error_type: 'unknown',
      fetch_error_message: 'Something went wrong while fetching from Royal Road. Please try again.',
    });
  });
});

describe('the retry policy', () => {
  const failure = new NetworkError('x');

  it('doubles the delay with each retry', () => {
    expect([0, 1, 2, 3].map((retries) => retryDelay(retries, failure, half))).toEqual([
      30_000, 60_000, 120_000, 240_000,
    ]);
  });

  it('keeps jitter within 20 %', () => {
    expect(retryDelay(0, failure, () => 0)).toBe(24_000);
    expect(retryDelay(0, failure, () => 1)).toBe(36_000);
  });

  it('waits at least two minutes for a site that limits requests, or what it asked', () => {
    expect(retryDelay(0, new RateLimited('429'), half)).toBe(120_000);
    expect(retryDelay(0, new RateLimited('429', 600_000), half)).toBe(600_000);
    expect(retryDelay(0, new RateLimited('429', 86_400_000), half)).toBe(3_600_000);
  });

  it('says in minutes how long a later retry waits', () => {
    const job = { retryCount: 2, maxRetries: 3 } as ClaimedJob;
    expect(planFailure(job, failure, 'Royal Road', half).progress).toBe(
      'Attempt 3 of 4 failed. Trying again in about 2 minutes.',
    );
  });

  it('does not retry a whole-novel fetch the site kept refusing', () => {
    const job = { retryCount: 0, maxRetries: 3 } as ClaimedJob;
    expect(planFailure(job, new KeptRefusing('x'), 'Royal Road', half)).toMatchObject({
      final: true,
      message: expect.stringContaining('kept refusing'),
    });
  });
});
