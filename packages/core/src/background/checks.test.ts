import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { insertNovel } from '../../test/catalog.js';
import { addSource, openTestDatabase } from '../../test/database.js';
import { exampleRegistry, novelUrl, serveNovel } from '../../test/example-site.js';
import { FakeSite } from '../../test/sites.js';
import type { Database } from '../db/database.js';
import type { Notice } from '../scraper/http.js';
import {
  type CheckList,
  type KeyValueStore,
  runBackgroundChecks,
  saveCheckList,
  takeInbox,
} from './checks.js';
import { buildCheckList } from './list.js';

const HOUR = 3_600_000;
const START = Date.parse('2026-10-01T12:00:00.000Z');

function memoryStore(): KeyValueStore & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    get: (key) => values.get(key) ?? null,
    set: (key, value) => void values.set(key, value),
  };
}

const novel = (id: number, chapters: number) => ({
  id: `n${id}`,
  title: `Novel ${id}`,
  url: novelUrl(id),
  chapters,
});

const list = (novels: CheckList['novels'], changes: Partial<CheckList> = {}): CheckList => ({
  enabled: true,
  notify: true,
  intervalHours: 6,
  lastCheckedAt: new Date(START - 7 * HOUR).toISOString(),
  novels,
  ...changes,
});

describe('checking while the app is closed', () => {
  let site: FakeSite;
  let store: ReturnType<typeof memoryStore>;
  let notices: Notice[];
  let clock: number;

  const run = (budget?: number) =>
    runBackgroundChecks({
      store,
      http: site,
      notify: (notice) => notices.push(notice),
      registry: exampleRegistry(),
      requestDelay: 0,
      now: () => clock,
      ...(budget === undefined ? {} : { budget }),
    });

  beforeEach(() => {
    site = new FakeSite();
    store = memoryStore();
    notices = [];
    clock = START;
  });

  it('notes new chapters in the inbox and announces them once', async () => {
    serveNovel(site, 1, 5);
    serveNovel(site, 2, 3);
    saveCheckList(store, list([novel(1, 3), novel(2, 3)]));

    expect(await run()).toEqual({
      due: true,
      checked: 2,
      found: { n1: { title: 'Novel 1', count: 2 } },
    });
    expect(notices).toEqual([{ title: 'New chapters', body: '2 new chapters of Novel 1.' }]);

    // Not due again until the interval has passed; then the same count isn't news.
    clock += HOUR;
    expect((await run()).due).toBe(false);
    clock += 6 * HOUR;
    expect(await run()).toMatchObject({ due: true, found: {} });
    expect(notices).toHaveLength(1);

    expect(takeInbox(store)).toEqual({ n1: { title: 'Novel 1', count: 2 } });
    expect(takeInbox(store)).toEqual({});
  });

  it("does nothing when background fetching is off, or the app's own check is recent", async () => {
    serveNovel(site, 1, 5);
    saveCheckList(store, list([novel(1, 3)], { enabled: false }));
    expect((await run()).due).toBe(false);
    saveCheckList(
      store,
      list([novel(1, 3)], { lastCheckedAt: new Date(START - HOUR).toISOString() }),
    );
    expect((await run()).due).toBe(false);
    expect(site.log).toEqual([]);
  });

  it('carries on where a run that ran out of time stopped', async () => {
    serveNovel(site, 1, 4);
    serveNovel(site, 2, 4);
    saveCheckList(store, list([novel(1, 3), novel(2, 3)]));
    // Each request moves the clock past the budget.
    const request = site.request.bind(site);
    site.request = (sent) => {
      clock += 2_000;
      return request(sent);
    };

    expect(await run(1_000)).toMatchObject({ checked: 1, found: { n1: { count: 1 } } });
    // Straight away, without waiting for the interval.
    expect(await run(1_000)).toMatchObject({ checked: 1, found: { n2: { count: 1 } } });
    expect((await run(1_000)).due).toBe(false);
  });

  it('skips a novel whose site fails, and forgets counts the app has caught up with', async () => {
    serveNovel(site, 2, 4);
    saveCheckList(store, list([novel(1, 3), novel(2, 3)], { notify: false }));
    expect(await run()).toMatchObject({ checked: 2, found: { n2: { count: 1 } } });
    expect(notices).toEqual([]);

    // The app stored the fourth chapter; a fifth is news again.
    saveCheckList(store, list([novel(2, 4)]));
    serveNovel(site, 2, 5);
    clock += 7 * HOUR;
    expect(await run()).toMatchObject({ found: { n2: { count: 1 } } });
  });
});

describe('the list the app leaves', () => {
  let db: Database;

  beforeEach(async () => {
    db = await openTestDatabase();
    await addSource(db);
  });
  afterEach(() => db.close());

  it('holds the novels being read or followed, with their chapter counts and the settings', async () => {
    const reading = await insertNovel(db, { title: 'Reading', chapters: 4 });
    const following = await insertNovel(db, { title: 'Following', chapters: 2 });
    const dropped = await insertNovel(db, { title: 'Dropped', chapters: 1 });
    await db.query(`UPDATE library_entries SET status = 'reading' WHERE novel_id = $1`, [
      reading.id,
    ]);
    await db.query(`UPDATE library_entries SET status = 'following' WHERE novel_id = $1`, [
      following.id,
    ]);
    await db.query(`UPDATE library_entries SET status = 'dropped' WHERE novel_id = $1`, [
      dropped.id,
    ]);
    await db.query(`UPDATE reader_preferences SET background_fetching = 1 WHERE id = 1`);

    const checks = await buildCheckList(db);
    expect(checks).toMatchObject({
      enabled: true,
      notify: true,
      intervalHours: 6,
      lastCheckedAt: null,
    });
    expect(checks.novels.map((n) => [n.title, n.chapters]).sort()).toEqual([
      ['Following', 2],
      ['Reading', 4],
    ]);
  });
});
