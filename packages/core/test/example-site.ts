// A made-up source site for job tests: novels as JSON, chapters as small pages, served by
// a FakeSite. Tests that run jobs don't need the saved pages of real sites.
import { silentLogger } from '../src/logger.js';
import type { Database } from '../src/db/database.js';
import { JobRunner } from '../src/jobs/runner.js';
import {
  Adapter,
  type ChapterHtml,
  type ChapterRef,
  type NovelMeta,
} from '../src/scraper/adapters/base.js';
import { Registry } from '../src/scraper/adapters/registry.js';
import { StructureChanged, UnsupportedUrl } from '../src/scraper/errors.js';
import type { Notice } from '../src/scraper/http.js';
import { HostThrottle, type SourceSession } from '../src/scraper/session.js';
import { publishSources } from '../src/scraper/sources.js';
import { type FakeSite, jsonResponse } from './sites.js';

const ORIGIN = 'https://example.test';

export const novelUrl = (id: number) => `${ORIGIN}/novel/${id}`;
export const chapterUrl = (id: number, n: number) => `${ORIGIN}/novel/${id}/${n}`;

interface NovelData {
  title: string;
  chapters: { url: string; title: string; date: string | null }[];
}

export class ExampleAdapter extends Adapter {
  readonly source = 'example';
  readonly name = 'Example';
  readonly homeUrl = ORIGIN;
  readonly hosts = new Set(['example.test']);
  override readonly fetchAllDelay = 1_000;

  canonicalize(url: string): string {
    const id = /^\/novel\/(\d+)/.exec(new URL(url).pathname)?.[1];
    if (!id) throw new UnsupportedUrl(`not a novel: ${url}`, "That address isn't a novel page.");
    return novelUrl(Number(id));
  }

  private async data(session: SourceSession, url: string): Promise<NovelData> {
    return (await session.getJson(`${url}.json`)) as NovelData;
  }

  async fetchNovel(session: SourceSession, url: string): Promise<NovelMeta> {
    const { title } = await this.data(session, url);
    return { title, author: 'A. Writer', description: null, tags: [], coverUrl: null };
  }

  async fetchChapterList(session: SourceSession, url: string): Promise<ChapterRef[]> {
    const { chapters } = await this.data(session, url);
    if (chapters.length === 0) throw new StructureChanged(`no chapters at ${url}`);
    return chapters.map((c) => ({
      url: c.url,
      title: c.title,
      publishedAt: c.date ? new Date(c.date) : null,
    }));
  }

  async fetchChapter(session: SourceSession, ref: ChapterRef): Promise<ChapterHtml> {
    const page = await session.get(ref.url);
    return { url: page.url, html: page.text, title: null };
  }
}

/** Serves novel `id` with chapters 1..`chapters`, each with a page of its own. */
export function serveNovel(
  site: FakeSite,
  id: number,
  chapters: number,
  title = `Novel ${id}`,
): FakeSite {
  const list = Array.from({ length: chapters }, (_, index) => ({
    url: chapterUrl(id, index + 1),
    title: `Chapter ${index + 1}`,
    date: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
  }));
  site.add(`${novelUrl(id)}.json`, jsonResponse({ title, chapters: list }));
  for (const chapter of list)
    site.add(chapter.url, { body: `<p>The text of ${chapter.title}.</p>` });
  return site;
}

export const exampleRegistry = () => new Registry([new ExampleAdapter()]);

/** A runner over the example site whose pauses are recorded instead of waited. */
export async function exampleRunner(
  db: Database,
  site: FakeSite,
  options: { maxRetries?: number } = {},
) {
  const registry = exampleRegistry();
  await publishSources(db, registry);
  const pauses: number[] = [];
  const notices: Notice[] = [];
  const runner = new JobRunner({
    db,
    registry,
    fetcher: { http: site, throttle: new HostThrottle(0), renderer: site },
    logger: silentLogger,
    maxRetries: options.maxRetries ?? 0,
    pollInterval: 10,
    scheduleUpdates: false,
    random: () => 0.5,
    notify: (notice) => notices.push(notice),
    sleep: (ms, signal) => {
      pauses.push(ms);
      signal?.throwIfAborted();
      return Promise.resolve();
    },
  });
  return { runner, pauses, notices, registry };
}

/** Waits until the job has finished; resolves to its row. */
export async function finishedJob(db: Database, jobId: string, timeout = 5_000) {
  const start = Date.now();
  for (;;) {
    const { rows } = await db.query<Record<string, unknown> & { status: string }>(
      'SELECT * FROM scrape_jobs WHERE id = $1',
      [jobId],
    );
    const row = rows[0];
    if (!row || row.status === 'completed' || row.status === 'failed') return row ?? null;
    if (Date.now() - start > timeout) throw new Error(`job ${jobId} is still ${row.status}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
