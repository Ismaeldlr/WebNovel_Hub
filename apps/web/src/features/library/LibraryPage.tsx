import {
  LIBRARY_PAGE_LIMITS,
  type LibraryItem,
  type LibraryStats,
  type LibraryStatus,
} from '@webnovel-hub/shared';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { BookPlus, Library, SearchX } from 'lucide-react';
import { useState } from 'react';
import { Navigate } from 'react-router';
import { libraryApi } from '../../api/catalog';
import { queryKeys } from '../../app/queryClient';
import {
  Button,
  ButtonLink,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  type TabItem,
  tabPanelProps,
  Tabs,
} from '../../components/ui';
import { formatRelativeTime, plural } from '../../lib/format';
import { STATUS_OPTIONS } from '../../lib/reading';
import { PageHeader } from '../pages/PageHeader';
import { LibraryFilterBar } from './LibraryFilterBar';
import styles from './LibraryPage.module.css';
import { useRemoveFromLibrary } from './libraryActions';
import { isFiltered, toLibraryQuery, useLibraryFilters } from './libraryFilters';
import { NovelCard } from './NovelCard';

function AddNovelLink() {
  return (
    <ButtonLink to="/add" variant="primary" icon={<BookPlus aria-hidden="true" />}>
      Add a novel
    </ButtonLink>
  );
}

/** The statuses as tabs over the shelves (§5.5), after "All". */
const STATUS_TABS: TabItem<LibraryStatus | 'all'>[] = [
  { id: 'all', label: 'All' },
  ...STATUS_OPTIONS.map(({ value, label }) => ({ id: value, label })),
];

/** My Library: summary, status tabs, filters, cards, load more. */
export function LibraryPage() {
  const { filters, restore, update, clear } = useLibraryFilters();
  const filtered = isFiltered(filters);
  const query = toLibraryQuery(filters);
  const list = useInfiniteQuery({
    queryKey: queryKeys.libraryList(query),
    queryFn: ({ pageParam, signal }) =>
      libraryApi.list({ ...query, page: pageParam, limit: LIBRARY_PAGE_LIMITS.default }, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
    // The last results stay on screen while the next ones load.
    placeholderData: keepPreviousData,
    enabled: restore === null,
  });
  const stats = useQuery({
    queryKey: queryKeys.libraryStats,
    queryFn: ({ signal }) => libraryApi.stats(signal),
  });
  const remove = useRemoveFromLibrary();
  const [removing, setRemoving] = useState<LibraryItem | null>(null);

  // Back on My Library in the same session: the filters as they were left.
  if (restore !== null) return <Navigate to={{ search: `?${restore}` }} replace />;

  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;
  const libraryTotal = stats.data?.total ?? null;
  // Nothing on the shelves at all, whatever the filters.
  const empty = libraryTotal === 0 || (!filtered && list.isSuccess && total === 0);

  return (
    <>
      <PageHeader
        title="My Library"
        lead="The novels you're reading, following or have finished, with your progress and new chapters."
        actions={empty ? undefined : <AddNovelLink />}
      />
      {stats.data && <LibrarySummary stats={stats.data} />}
      {!empty && (
        <div className={styles.tabs}>
          <Tabs
            label="Status"
            idPrefix="library-status"
            tabs={STATUS_TABS}
            selected={filters.status ?? 'all'}
            onSelect={(id) => update({ status: id === 'all' ? null : id })}
          />
        </div>
      )}
      {!empty && (
        <LibraryFilterBar
          filters={filters}
          onChange={update}
          onClear={clear}
          summary={list.data ? matchSummary(total, filtered ? libraryTotal : null) : ''}
        />
      )}

      <div {...(!empty && tabPanelProps('library-status', filters.status ?? 'all'))}>
        {list.isPending ? (
          <LoadingState label="Loading your library" />
        ) : list.isError ? (
          <ErrorState
            title="Your library didn't load"
            message={list.error.message}
            onRetry={() => void list.refetch()}
            retrying={list.isFetching}
          />
        ) : empty ? (
          <EmptyState
            icon={<Library aria-hidden="true" />}
            title="Your shelves are empty"
            action={<AddNovelLink />}
          >
            <p>Paste the address of a novel from a supported site, and it will be waiting here.</p>
          </EmptyState>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<SearchX aria-hidden="true" />}
            title="No novels match"
            action={<Button onClick={clear}>Clear filters</Button>}
          >
            <p>Nothing on your shelves fits these filters. Try another search, or clear them.</p>
          </EmptyState>
        ) : (
          <section aria-labelledby="library-novels">
            <h2 id="library-novels" className="visually-hidden">
              Your novels
            </h2>
            <ul className={styles.grid} aria-busy={list.isPlaceholderData || undefined}>
              {items.map((item) => (
                <li key={item.novel.id}>
                  <NovelCard item={item} onRemove={setRemoving} />
                </li>
              ))}
            </ul>
            <div className={styles.more}>
              <p className={styles.count} aria-live="polite">
                Showing {items.length.toLocaleString()} of{' '}
                {plural(total, filtered ? 'matching novel' : 'novel')}
              </p>
              {list.hasNextPage && (
                <Button onClick={() => void list.fetchNextPage()} busy={list.isFetchingNextPage}>
                  Load more
                </Button>
              )}
            </div>
          </section>
        )}
      </div>

      <ConfirmDialog
        open={removing !== null}
        title={`Delete “${removing?.novel.title ?? ''}”?`}
        confirmLabel="Delete"
        tone="danger"
        busy={remove.isPending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (!removing) return;
          remove.mutate(
            { novelId: removing.novel.id, title: removing.novel.title },
            { onSettled: () => setRemoving(null) },
          );
        }}
      >
        <p>
          Its chapters, their stored text, its cover and your reading history of it are deleted from
          this device. It can't be undone.
        </p>
      </ConfirmDialog>
    </>
  );
}

/**
 * What the filter bar reads out as the list changes: "12 novels", or with filters on,
 * "3 of 12 novels match" (out of the whole library, when its size is known).
 */
function matchSummary(matching: number, libraryTotal: number | null): string {
  if (libraryTotal === null) return plural(matching, 'novel');
  const verb = matching === 1 ? 'matches' : 'match';
  return `${matching.toLocaleString()} of ${plural(libraryTotal, 'novel')} ${verb}`;
}

/** Summary metrics: novels, reading, new chapters, last update. */
function LibrarySummary({ stats }: { stats: LibraryStats }) {
  if (stats.total === 0) return null;
  const { total, byStatus, newChapters, lastCheckedAt } = stats;
  const tiles = [
    { label: 'Novels', value: total.toLocaleString() },
    { label: 'Reading', value: byStatus.reading.toLocaleString() },
    { label: 'New chapters', value: newChapters.toLocaleString() },
    { label: 'Last checked', value: lastCheckedAt ? formatRelativeTime(lastCheckedAt) : 'Not yet' },
  ];
  return (
    <section aria-label="Library summary">
      <dl className={styles.summary}>
        {tiles.map((tile) => (
          <div key={tile.label} className={styles.tile}>
            <dt>{tile.label}</dt>
            <dd>{tile.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
