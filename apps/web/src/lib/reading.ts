import { LIBRARY_STATUSES, type LibraryState, type LibraryStatus } from '@webnovel-hub/shared';

export const STATUS_LABELS: Record<LibraryStatus, string> = {
  reading: 'Reading',
  following: 'Following',
  on_hold: 'On hold',
  dropped: 'Dropped',
  completed: 'Completed',
};

export const STATUS_OPTIONS = LIBRARY_STATUSES.map((status) => ({
  value: status,
  label: STATUS_LABELS[status],
}));

/** The reader route. */
export const readerPath = (novelId: string, chapter: number) => `/reader/${novelId}/${chapter}`;

/**
 * Where Continue / Start reading goes: the last chapter read, from the
 * saved progress, or chapter 1.
 */
export function readingTarget(novelId: string, library: LibraryState | null) {
  const last = library?.lastReadChapterNumber ?? null;
  return last === null
    ? { to: readerPath(novelId, 1), chapter: 1, label: 'Start reading' }
    : { to: readerPath(novelId, last), chapter: last, label: 'Continue' };
}

/** Reading progress: the furthest chapter reached out of the total. */
export function progress(library: LibraryState | null, totalChapters: number) {
  const reached = Math.min(library?.furthestChapterNumber ?? 0, totalChapters);
  const percent = totalChapters > 0 ? Math.round((reached / totalChapters) * 100) : 0;
  return { reached, total: totalChapters, percent };
}
