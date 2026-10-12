import {
  DEFAULT_LIBRARY_SORT,
  LIBRARY_SORTS,
  LIBRARY_STATUSES,
  type LibraryQuery,
  type LibrarySort,
  type LibraryStatus,
  SOURCE_KEY_PATTERN,
} from '@webnovel-hub/shared';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';

/** The library's filters, sort and search, as the page holds them. */
export interface LibraryFilters {
  status: LibraryStatus | null;
  source: string | null;
  favorite: boolean;
  unread: boolean;
  sort: LibrarySort;
  q: string;
}

export const SORT_LABELS: Record<LibrarySort, string> = {
  last_read: 'Last read',
  last_updated: 'Last updated',
  title: 'Title A–Z',
  added: 'Date added',
  progress: 'Progress',
};

/** Where the session's filters are kept; cleared when the session ends. */
export const LIBRARY_FILTERS_KEY = 'webnovel-hub.library-filters';

const isStatus = (value: string | null): value is LibraryStatus =>
  (LIBRARY_STATUSES as readonly (string | null)[]).includes(value);
const isSort = (value: string | null): value is LibrarySort =>
  (LIBRARY_SORTS as readonly (string | null)[]).includes(value);

/** Reads filters from an address's query; anything unknown or malformed is ignored. */
export function parseFilters(params: URLSearchParams): LibraryFilters {
  const status = params.get('status');
  const source = params.get('source');
  const sort = params.get('sort');
  return {
    status: isStatus(status) ? status : null,
    source: source !== null && SOURCE_KEY_PATTERN.test(source) ? source : null,
    favorite: params.get('favorite') === 'true',
    unread: params.get('unread') === 'true',
    sort: isSort(sort) ? sort : DEFAULT_LIBRARY_SORT,
    q: (params.get('q') ?? '').trim(),
  };
}

/** The address query for filters: only what differs from the defaults, in a fixed order. */
export function filtersToParams(filters: LibraryFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.source) params.set('source', filters.source);
  if (filters.favorite) params.set('favorite', 'true');
  if (filters.unread) params.set('unread', 'true');
  if (filters.sort !== DEFAULT_LIBRARY_SORT) params.set('sort', filters.sort);
  if (filters.q) params.set('q', filters.q);
  return params;
}

/** Whether anything narrows the list; a sort alone doesn't. */
export function isFiltered(filters: LibraryFilters): boolean {
  return (
    filters.status !== null ||
    filters.source !== null ||
    filters.favorite ||
    filters.unread ||
    filters.q !== ''
  );
}

/** The request for GET /library: only the filters in use. */
export function toLibraryQuery(filters: LibraryFilters): LibraryQuery {
  return {
    ...(filters.status && { status: filters.status }),
    ...(filters.source && { source: filters.source }),
    ...(filters.favorite && { favorite: true }),
    ...(filters.unread && { unread: true }),
    sort: filters.sort,
    ...(filters.q && { q: filters.q }),
  };
}

// sessionStorage can be missing or refuse writes (private modes, blocked storage); the
// filters then simply don't outlive the page.
function remember(query: string): void {
  try {
    sessionStorage.setItem(LIBRARY_FILTERS_KEY, query);
  } catch {
    // not kept
  }
}

function remembered(): string {
  try {
    return sessionStorage.getItem(LIBRARY_FILTERS_KEY) ?? '';
  } catch {
    return '';
  }
}

/**
 * The library's filters. They live in the address, so a reload or a shared
 * link keeps them, and are mirrored to sessionStorage, so coming back to My Library from
 * another page in the same session brings them back.
 *
 * `restore` is set when the address has no filters but the session has some: the page
 * should redirect there (with `replace`) instead of loading the unfiltered list first.
 */
export function useLibraryFilters() {
  const [params, setParams] = useSearchParams();
  const filters = parseFilters(params);
  const query = filtersToParams(filters).toString();
  const saved = remembered();
  const restore = query === '' && saved !== '' ? saved : null;

  // Also covers filters that arrive in the address, e.g. from a link or a reload.
  useEffect(() => {
    if (restore === null) remember(query);
  }, [query, restore]);

  // The router applies a navigation in a transition, so a second change can arrive before
  // the page re-renders (a select, then the search box's delayed update). Each change
  // builds on the one before it, not on the filters this render shows.
  const pending = useRef<string | null>(null);
  useEffect(() => {
    pending.current = null;
  }, [query]);

  const update = (change: Partial<LibraryFilters>) => {
    const latest = parseFilters(new URLSearchParams(pending.current ?? query));
    const next = filtersToParams({ ...latest, ...change }).toString();
    pending.current = next;
    // Remembered before the address changes, so clearing every filter isn't undone by
    // `restore` on the next render.
    remember(next);
    setParams(next, { replace: true, preventScrollReset: true });
  };

  return {
    filters,
    restore,
    update,
    /** Clears the filters and the search; the sort stays. */
    clear: () => update({ status: null, source: null, favorite: false, unread: false, q: '' }),
  };
}
