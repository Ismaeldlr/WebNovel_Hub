import type { HistoryEntry } from '@webnovel-hub/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { History, SearchX } from 'lucide-react';
import { Link } from 'react-router';
import { type HistoryFilter, historyApi } from '../../api/history';
import { queryKeys } from '../../app/queryClient';
import { Button, ButtonLink, EmptyState, ErrorState, Spinner } from '../../components/ui';
import { formatDay, formatTime, todayIn } from '../../lib/format';
import styles from './HistoryPage.module.css';

/** Consecutive entries of one day (the API sorts them newest first). */
function byDay(entries: HistoryEntry[]): { date: string; entries: HistoryEntry[] }[] {
  const days: { date: string; entries: HistoryEntry[] }[] = [];
  for (const entry of entries) {
    const last = days.at(-1);
    if (last?.date === entry.date) last.entries.push(entry);
    else days.push({ date: entry.date, entries: [entry] });
  }
  return days;
}

/** The chapter view: chapters read, grouped by the reader's days, with Load more. */
export function ChapterHistory({
  filter,
  onClearFilters,
}: {
  filter: HistoryFilter;
  onClearFilters: () => void;
}) {
  const history = useInfiniteQuery({
    queryKey: queryKeys.historyChapters(filter),
    queryFn: ({ pageParam, signal }) => historyApi.chapters(filter, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

  if (history.isPending) {
    return (
      <div className={styles.loading}>
        <Spinner size="lg" label="Loading your history" />
      </div>
    );
  }
  if (history.isError) {
    return (
      <ErrorState
        title="Your history didn't load"
        message={history.error.message}
        onRetry={() => void history.refetch()}
        retrying={history.isFetching}
      />
    );
  }

  const entries = history.data.pages.flatMap((page) => page.items);
  const timezone = history.data.pages[0]?.timezone ?? 'UTC';
  const filtered = filter.range !== 'all' || filter.novelId !== null;
  if (entries.length === 0) {
    return filtered ? (
      <EmptyState
        icon={<SearchX aria-hidden="true" />}
        title="Nothing read here"
        headingLevel={2}
        action={<Button onClick={onClearFilters}>Show all history</Button>}
      >
        <p>No chapters match this range and novel.</p>
      </EmptyState>
    ) : (
      <EmptyState
        icon={<History aria-hidden="true" />}
        title="No reading history yet"
        headingLevel={2}
        action={<ButtonLink to="/library">Open your library</ButtonLink>}
      >
        <p>Each chapter you open in the reader appears here, by day.</p>
      </EmptyState>
    );
  }

  const today = todayIn(timezone);
  return (
    <div className={styles.days}>
      {byDay(entries).map((day) => (
        <section key={day.date} aria-labelledby={`day-${day.date}`} className={styles.day}>
          <h2 id={`day-${day.date}`} className={styles.dayHeading}>
            {formatDay(day.date, today)}
          </h2>
          <ol className={styles.entries}>
            {day.entries.map((entry) => (
              <li key={entry.id} className={styles.entry}>
                <time className={styles.time} dateTime={entry.readAt}>
                  {formatTime(entry.readAt, timezone)}
                </time>
                <div className={styles.entryMain}>
                  <Link
                    to={`/reader/${entry.novel.id}/${entry.chapter.number}`}
                    className={styles.chapterLink}
                  >
                    {entry.chapter.title}
                  </Link>
                  <Link to={`/novels/${entry.novel.id}`} className={styles.novelLink}>
                    {entry.novel.title}
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {history.hasNextPage && (
        <div className={styles.more}>
          <Button onClick={() => void history.fetchNextPage()} busy={history.isFetchingNextPage}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
