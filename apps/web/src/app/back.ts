// Back goes up the app's pages, not back through every page seen: from a chapter to its
// novel, from a novel to the list it was opened from (the library, the history...), from
// any other page to the library, and from the library out of the app. The top bar's back
// arrow, the reader's arrow and the phone's back button all do this.
//
// The pages visited are kept (by their history entry), so going up returns to the page
// above when it is still there (keeping its scroll and filters) and otherwise replaces the
// page with the one above, so the browser history never fills with pages to go back
// through.
import { type MouseEvent, useCallback, useEffect, useEffectEvent } from 'react';
import { NavigationType, useLocation, useNavigate, useNavigationType } from 'react-router';
import { closeBackLayer } from '../lib/hooks';
import { getPlatform } from '../platform';
import { HOME_PATH, NAV_ITEMS } from './navigation';

/** A history entry: react-router's key and the page's path. */
interface Entry {
  key: string;
  path: string;
}

/** Where up goes from a page: an earlier page it may return to, else `fallback`. */
interface Parent {
  matches: (path: string) => boolean;
  fallback: string;
}

const READER = /^\/reader\/([^/]+)\/[^/]+$/;
const isListPage = (path: string) => NAV_ITEMS.some((item) => item.path === path);

/** The page above `path`, or null for the library, the top. */
export function parentOf(path: string): Parent | null {
  const reader = READER.exec(path);
  if (reader) {
    const novel = `/novels/${reader[1]}`;
    return { matches: (earlier) => earlier === novel, fallback: novel };
  }
  if (/^\/novels\/[^/]+$/.test(path)) return { matches: isListPage, fallback: HOME_PATH };
  if (/^\/settings\/[^/]+$/.test(path)) {
    return { matches: (earlier) => earlier === '/settings', fallback: '/settings' };
  }
  // Opened from Profile, or from the reader's menu.
  if (path === '/profile/terms') {
    return {
      matches: (earlier) => earlier === '/profile' || READER.test(earlier),
      fallback: '/profile',
    };
  }
  if (path === HOME_PATH) return null;
  return { matches: (earlier) => earlier === HOME_PATH, fallback: HOME_PATH };
}

const STORAGE_KEY = 'webnovel-hub:pages';

/** The pages of this visit, kept over a reload (restoring a backup reloads the page). */
const visit: { entries: Entry[]; index: number } = (() => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null') as {
      entries?: Entry[];
      index?: number;
    } | null;
    if (Array.isArray(saved?.entries) && typeof saved.index === 'number') {
      return { entries: saved.entries, index: saved.index };
    }
  } catch {
    // Storage may be off; the visit starts over.
  }
  return { entries: [], index: -1 };
})();

function record(type: NavigationType, entry: Entry): void {
  const { entries } = visit;
  if (entries[visit.index]?.key === entry.key) {
    entries[visit.index] = entry; // the same entry again (React's strict mode)
  } else if (type === NavigationType.Push) {
    visit.entries = [...entries.slice(0, visit.index + 1), entry];
    visit.index = visit.entries.length - 1;
  } else if (type === NavigationType.Replace && visit.index >= 0) {
    entries[visit.index] = entry;
  } else {
    const index = entries.findIndex((each) => each.key === entry.key);
    if (index >= 0) {
      visit.index = index;
    } else {
      visit.entries = [entry];
      visit.index = 0;
    }
  }
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(visit));
  } catch {
    // Kept in memory only.
  }
}

/** Notes each page the app shows, so going up knows what is before it. */
export function useVisitedPages(): void {
  const location = useLocation();
  const type = useNavigationType();
  useEffect(() => {
    record(type, { key: location.key, path: location.pathname });
  }, [type, location.key, location.pathname]);
}

/** Goes to the page above this one; false on the library, which has none. */
export function useGoUp(): () => boolean {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(() => {
    const parent = parentOf(location.pathname);
    if (!parent) return false;
    // The entries before this one, when the visit knows where this one is.
    const known = visit.entries[visit.index]?.key === location.key;
    for (let index = known ? visit.index - 1 : -1; index >= 0; index--) {
      if (parent.matches(visit.entries[index]!.path)) {
        void navigate(index - visit.index);
        return true;
      }
    }
    void navigate(parent.fallback, { replace: true });
    return true;
  }, [navigate, location.pathname, location.key]);
}

/**
 * For a link to the page above (the reader's link to its novel): a click goes up instead,
 * so the page isn't stacked again. A click with a modifier key stays a plain link.
 */
export function useUpClick(): (event: MouseEvent<HTMLAnchorElement>) => void {
  const goUp = useGoUp();
  return (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (goUp()) event.preventDefault();
  };
}

/**
 * The phone's back button: it closes the menu or dialog that is open, else goes up a
 * page; on the library the app goes to the background.
 */
export function usePhoneBackButton(): void {
  const goUp = useGoUp();
  const onBack = useEffectEvent(() => closeBackLayer() || goUp());
  useEffect(() => {
    let stop: (() => void) | undefined;
    let ended = false;
    void getPlatform().then((platform) => {
      if (!ended) stop = platform.android?.onBackButton(() => onBack());
    });
    return () => {
      ended = true;
      stop?.();
    };
  }, []);
}
