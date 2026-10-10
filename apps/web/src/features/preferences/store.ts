import {
  type PreferencesUpdate,
  READER_PREFERENCE_DEFAULTS,
  type ReaderPreferences,
  THEME_PREFERENCES,
  type ThemePreference,
} from '@webnovel-hub/shared';
import type { QueryClient } from '@tanstack/react-query';
import { userApi } from '../../api/user';

/** The query holding the signed-in user's preferences (GET /api/user/preferences). */
export const PREFERENCES_QUERY_KEY = ['preferences'] as const;

/** How long after the last change the preferences are saved. */
export const SAVE_DELAY_MS = 600;

// ---- The localStorage mirror ----

/**
 * localStorage key of the mirror: `{ userId, preferences }`. The inline script in
 * index.html reads the theme from it to paint every page in it before the first frame
 *; a test keeps the two in step.
 */
export const PREFERENCES_STORAGE_KEY = 'webnovel-hub.reader-preferences';

interface Mirror {
  userId: string;
  preferences: ReaderPreferences;
}

function readStoredMirror(): Partial<Mirror> | null {
  try {
    const stored = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Partial<Mirror>) : null;
  } catch {
    return null; // blocked storage, or not JSON
  }
}

/**
 * The preferences this device last saw for the user: shown straight away while the
 * server's copy loads, so the reader never flashes the default look.
 */
export function readMirror(userId: string): ReaderPreferences | undefined {
  const mirror = readStoredMirror();
  if (mirror?.userId !== userId || typeof mirror.preferences !== 'object' || !mirror.preferences) {
    return undefined;
  }
  // Written by an older version, it may lack a preference added since.
  return { ...READER_PREFERENCE_DEFAULTS, ...mirror.preferences };
}

/** The mirrored theme, whoever it belongs to: for painting before sign-in is known. */
export function mirroredTheme(): ThemePreference | null {
  const theme = readStoredMirror()?.preferences?.theme;
  return (THEME_PREFERENCES as readonly unknown[]).includes(theme)
    ? (theme as ThemePreference)
    : null;
}

export function writeMirror(userId: string, preferences: ReaderPreferences): void {
  try {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ userId, preferences }));
  } catch {
    // Not mirrored; the server's copy still loads.
  }
}

// ---- Saving in the background ----

/** What the save indicator shows: nothing yet, a save on its way, done, or refused. */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

const isEmpty = (changes: PreferencesUpdate) => Object.keys(changes).length === 0;

/**
 * Applies preference changes at once (to the query, so every view restyles) and saves them
 * shortly after the last one. Saves go one at a time, so the server ends with the
 * latest value. A failed save puts back what the server last confirmed. One per QueryClient.
 */
export class PreferenceSaver {
  status: SaveStatus = 'idle';

  private readonly queryClient: QueryClient;
  /** Told when a save fails (a toast): see `setErrorHandler`. */
  private onError: (error: Error) => void = () => undefined;
  /** Changes waiting for the delay, and the ones being sent. */
  private pending: PreferencesUpdate = {};
  private sending: PreferencesUpdate = {};
  private timer: ReturnType<typeof setTimeout> | undefined;
  private queue: Promise<void> = Promise.resolve();
  /** The server's copy, as last seen: what a failed save goes back to. */
  private confirmed: ReaderPreferences | undefined;
  /** Bumped by `forget`, so nothing from a previous session lands in the next one. */
  private generation = 0;
  private readonly listeners = new Set<() => void>();
  private hideListener: (() => void) | undefined;

  constructor(queryClient: QueryClient) {
    this.queryClient = queryClient;
  }

  /** Applies `changes` now and saves them after SAVE_DELAY_MS without further changes. */
  change(changes: PreferencesUpdate): void {
    // A fetch landing now would bring back the old values.
    void this.queryClient.cancelQueries({ queryKey: PREFERENCES_QUERY_KEY });
    this.queryClient.setQueryData<ReaderPreferences>(PREFERENCES_QUERY_KEY, (current) =>
      current ? { ...current, ...changes } : current,
    );
    this.pending = { ...this.pending, ...changes };
    this.setStatus('saving');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), SAVE_DELAY_MS);
    this.flushWhenHidden();
  }

  /**
   * The server's copy with the changes not saved yet on top: what a fetch returns, so a
   * refetch during a save doesn't undo what the reader just chose.
   */
  received(server: ReaderPreferences): ReaderPreferences {
    this.confirmed = server;
    return { ...server, ...this.sending, ...this.pending };
  }

  /** Sends the waiting changes now (the page is being hidden or closed). */
  flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    const changes = this.pending;
    if (isEmpty(changes)) return this.queue;
    this.pending = {};
    const generation = this.generation;
    this.queue = this.queue.then(() => this.send(changes, generation));
    return this.queue;
  }

  /** Forgets everything, e.g. on sign-out: a waiting save is dropped, not sent. */
  forget(): void {
    this.generation += 1;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = {};
    this.sending = {};
    this.confirmed = undefined;
    this.setStatus('idle');
  }

  /**
   * Who is told when a save fails. The latest caller wins, and it stays after its component
   * unmounts: a save that fails after the reader left the page is still reported.
   */
  setErrorHandler(handler: (error: Error) => void): void {
    this.onError = handler;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getStatus = (): SaveStatus => this.status;

  private async send(changes: PreferencesUpdate, generation: number) {
    if (generation !== this.generation) return;
    this.sending = changes;
    try {
      const saved = await userApi.updatePreferences(changes);
      if (generation !== this.generation) return;
      this.sending = {};
      this.confirmed = saved;
      // Changes made while this one was on its way stay on top.
      this.queryClient.setQueryData<ReaderPreferences>(PREFERENCES_QUERY_KEY, {
        ...saved,
        ...this.pending,
      });
      this.setStatus(this.timer === undefined && isEmpty(this.pending) ? 'saved' : 'saving');
    } catch (error) {
      if (generation !== this.generation) return; // signed out meanwhile (a 401 does that)
      // Back to what the server has: the changes waiting behind this one go too.
      this.sending = {};
      this.pending = {};
      clearTimeout(this.timer);
      this.timer = undefined;
      if (this.confirmed) {
        this.queryClient.setQueryData(PREFERENCES_QUERY_KEY, this.confirmed);
      }
      void this.queryClient.invalidateQueries({ queryKey: PREFERENCES_QUERY_KEY });
      this.setStatus('failed');
      this.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private setStatus(status: SaveStatus) {
    if (status === this.status) return;
    this.status = status;
    this.listeners.forEach((listener) => listener());
  }

  // A change made just before the app is closed or hidden is saved right away, so it
  // isn't lost with the timer.
  private flushWhenHidden() {
    if (this.hideListener) return;
    this.hideListener = () => {
      if (document.visibilityState === 'hidden') void this.flush();
    };
    document.addEventListener('visibilitychange', this.hideListener);
  }
}

const savers = new WeakMap<QueryClient, PreferenceSaver>();

export function saverFor(queryClient: QueryClient): PreferenceSaver {
  let saver = savers.get(queryClient);
  if (!saver) {
    saver = new PreferenceSaver(queryClient);
    savers.set(queryClient, saver);
  }
  return saver;
}
