// The background runner's script (capacitor.config.ts: BackgroundRunner). Android runs it
// in a small JavaScript engine of its own (QuickJS), with fetch, a key-value store and
// notifications but no page and no database, every 30 minutes or so, also while the app
// is closed. The checks themselves are the core's (packages/core/src/background).
import './polyfills';
import {
  type KeyValueStore,
  noticeNumber,
  runBackgroundChecks,
  saveCheckList,
  takeInbox,
} from '@webnovel-hub/core/background';
import type { CheckList, HttpClient } from '@webnovel-hub/core';

/** What the engine provides (@capacitor/background-runner, "JavaScript API"). */
declare const CapacitorKV: {
  get(key: string): { value: string | null } | string | null;
  set(key: string, value: string): void;
};
declare const CapacitorNotifications: {
  schedule(notifications: { id: number; title: string; body: string; smallIcon?: string }[]): void;
};
declare function addEventListener(
  event: string,
  handler: (
    resolve: (value?: unknown) => void,
    reject: (error: unknown) => void,
    details: unknown,
  ) => void,
): void;

const store: KeyValueStore = {
  get(key) {
    const got = CapacitorKV.get(key);
    return typeof got === 'string' ? got : (got?.value ?? null);
  },
  set: (key, value) => CapacitorKV.set(key, value),
};

function lowerCase(headers: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (headers && typeof (headers as Headers).forEach === 'function') {
    (headers as Headers).forEach((value, name) => (result[name.toLowerCase()] = value));
  } else {
    for (const [name, value] of Object.entries((headers ?? {}) as Record<string, unknown>)) {
      result[name.toLowerCase()] = String(value);
    }
  }
  return result;
}

/** The engine's fetch, which follows redirects and isn't bound by any page's rules. */
const http: HttpClient = {
  async request({ url, method, headers, body, timeout }) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`${url} didn't answer in time`)), timeout);
    });
    try {
      const response = await Promise.race([
        fetch(url, { method, headers, ...(body === undefined ? {} : { body: body as BodyInit }) }),
        late,
      ]);
      const bytes =
        typeof response.arrayBuffer === 'function'
          ? new Uint8Array(await response.arrayBuffer())
          : new TextEncoder().encode(await response.text());
      return {
        url: response.url || url,
        status: response.status,
        headers: lowerCase(response.headers),
        body: bytes,
      };
    } finally {
      clearTimeout(timer);
    }
  },
};

const settle = (
  work: () => unknown,
  resolve: (value?: unknown) => void,
  reject: (e: unknown) => void,
): void => {
  Promise.resolve()
    .then(work)
    .then(resolve, (error: unknown) => reject(error instanceof Error ? error.message : error));
};

// Due checks, on the schedule Android keeps.
addEventListener('checkForUpdates', (resolve, reject) =>
  settle(
    () =>
      runBackgroundChecks({
        store,
        http,
        // The engine shows a title and a body only; a novel's notice keeps its number, so
        // the app's next one for the novel takes its place.
        notify: (notice) =>
          CapacitorNotifications.schedule([
            {
              id: noticeNumber(notice),
              title: notice.title,
              body: notice.body,
              smallIcon: 'ic_stat_notify',
            },
          ]),
      }),
    resolve,
    reject,
  ),
);

// From the app: what to check next time, and what the checks found meanwhile.
addEventListener('saveCheckList', (resolve, reject, details) =>
  settle(() => saveCheckList(store, details as CheckList), resolve, reject),
);
addEventListener('takeInbox', (resolve, reject) => settle(() => takeInbox(store), resolve, reject));
