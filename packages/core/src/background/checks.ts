// New chapters looked for while the app is closed, by a platform task that can't open
// the database (Android's background runner: a small JavaScript engine with fetch and a
// key-value store). The app leaves the list of novels to check in the store whenever it
// goes out of sight; the task checks their chapter lists when a check is due and notes
// what it found in an inbox there; the app takes the inbox when it next opens and runs
// its own checks for those novels, which store the chapters the usual way.
import { newChaptersNotice } from '../jobs/notice.js';
import { type Registry, defaultRegistry } from '../scraper/adapters/registry.js';
import type { HttpClient, Notice } from '../scraper/http.js';
import { HostThrottle, SourceSession } from '../scraper/session.js';

/** What the app leaves for the task. */
export interface CheckList {
  /** Checks may run while the app is closed: the reader allows background fetching. */
  enabled: boolean;
  /** New chapters are announced with a notification. */
  notify: boolean;
  intervalHours: number;
  /** When the app itself last ran a scheduled check (ISO 8601), or null. */
  lastCheckedAt: string | null;
  /** Stalest first: when a run runs out of time, the rest wait for the next. */
  novels: { id: string; title: string; url: string; chapters: number }[];
}

/** Strings kept between runs (Android: the app's shared preferences). */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/** Novels with new chapters, by id. */
export type Inbox = Record<string, { title: string; count: number }>;

const LIST = 'checks.list';
const CHECKED_AT = 'checks.checkedAt';
/** Where a run that ran out of time stopped, so the next run carries on from there. */
const RESUME = 'checks.resume';
/** Chapter counts already announced, so a count is announced once. */
const SEEN = 'checks.seen';
const INBOX = 'checks.inbox';

function read<T>(store: KeyValueStore, key: string, fallback: T): T {
  const text = store.get(key);
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/** Keeps the app's list for the next runs, and forgets counts the app has caught up with. */
export function saveCheckList(store: KeyValueStore, list: CheckList): void {
  store.set(LIST, JSON.stringify(list));
  const seen = read<Record<string, number>>(store, SEEN, {});
  const ahead = list.novels.filter((novel) => (seen[novel.id] ?? 0) > novel.chapters);
  store.set(SEEN, JSON.stringify(Object.fromEntries(ahead.map((n) => [n.id, seen[n.id]]))));
}

/** The novels found with new chapters since the app last asked; the inbox empties. */
export function takeInbox(store: KeyValueStore): Inbox {
  const inbox = read<Inbox>(store, INBOX, {});
  store.set(INBOX, '{}');
  return inbox;
}

export interface BackgroundCheckOptions {
  store: KeyValueStore;
  http: HttpClient;
  notify?: (notice: Notice) => void;
  registry?: Registry;
  /** Milliseconds between two requests to one site, unless its adapter asks for more. */
  requestDelay?: number;
  /** How long one run may take, in milliseconds; Android stops a task after 10 minutes. */
  budget?: number;
  now?: () => number;
}

export interface BackgroundCheckResult {
  /** Whether a check was due; nothing else happened when it wasn't. */
  due: boolean;
  checked: number;
  found: Inbox;
}

/** Checks the listed novels for new chapters when a check is due. Never throws. */
export async function runBackgroundChecks(
  options: BackgroundCheckOptions,
): Promise<BackgroundCheckResult> {
  const { store, http } = options;
  const now = options.now ?? Date.now;
  const idle = { due: false, checked: 0, found: {} };
  const list = read<CheckList | null>(store, LIST, null);
  if (!list?.enabled || list.novels.length === 0) return idle;

  let resume = Number(store.get(RESUME)) || 0;
  if (resume >= list.novels.length) resume = 0;
  const last = Math.max(
    Date.parse(list.lastCheckedAt ?? '') || 0,
    Number(store.get(CHECKED_AT)) || 0,
  );
  if (resume === 0 && now() - last < list.intervalHours * 3_600_000) return idle;

  const registry = options.registry ?? defaultRegistry();
  const throttle = new HostThrottle(options.requestDelay ?? 2_000, {
    hostDelays: registry.hostDelays(),
  });
  const seen = read<Record<string, number>>(store, SEEN, {});
  const inbox = read<Inbox>(store, INBOX, {});
  const found: Inbox = {};
  const started = now();
  let checked = 0;
  let next = resume;

  for (; next < list.novels.length; next++) {
    if (now() - started > (options.budget ?? 8 * 60_000)) break;
    const novel = list.novels[next]!;
    try {
      const adapter = registry.forUrl(novel.url);
      const chapters = await adapter.fetchChapterList(
        new SourceSession({ http, throttle }),
        novel.url,
      );
      const known = Math.max(novel.chapters, seen[novel.id] ?? 0);
      if (chapters.length > known) {
        const count = chapters.length - known;
        found[novel.id] = { title: novel.title, count };
        inbox[novel.id] = { title: novel.title, count: (inbox[novel.id]?.count ?? 0) + count };
        seen[novel.id] = chapters.length;
      }
    } catch {
      // The app's own check reports what went wrong; this one only looks.
    }
    checked++;
  }

  store.set(SEEN, JSON.stringify(seen));
  store.set(INBOX, JSON.stringify(inbox));
  if (next < list.novels.length) {
    store.set(RESUME, String(next));
  } else {
    store.set(RESUME, '0');
    store.set(CHECKED_AT, String(now()));
  }
  if (list.notify && Object.keys(found).length > 0) {
    options.notify?.(newChaptersNotice(Object.values(found)));
  }
  return { due: true, checked, found };
}
