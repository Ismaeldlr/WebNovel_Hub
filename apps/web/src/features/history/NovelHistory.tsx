import type { HistoryNovelItem, HistoryRange } from '@webnovel-hub/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { BookOpen, History, SearchX } from 'lucide-react';
import { Link } from 'react-router';
import { historyApi } from '../../api/history';
import { queryKeys } from '../../app/queryClient';
import { NovelRow, NovelRowList, NovelRowMeta } from '../../components/NovelRow';
import {
  Button,
  ButtonLink,
  EmptyState,
  ErrorState,
  ProgressBar,
  Spinner,
} from '../../components/ui';
import { formatRelativeTime, plural } from '../../lib/format';
import styles from './HistoryPage.module.css';

/** The novel view: per novel, chapters read, the last one, progress and Continue. */
export function NovelHistory({ range, onShowAll }: { range: HistoryRange; onShowAll: () => void }) {
  const novels = useInfiniteQuery({
    queryKey: queryKeys.historyByNovel({ range }),
    queryFn: ({ pageParam, signal }) => historyApi.byNovel(range, pageParam, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
  });

  if (novels.isPending) {
    return (
      <div className={styles.loading}>
        <Spinner size="lg" label="Loading your novels" />
      </div>
    );
  }
  if (novels.isError) {
    return (
      <ErrorState
        title="Your history didn't load"
        message={novels.error.message}
        onRetry={() => void novels.refetch()}
        retrying={novels.isFetching}
      />
    );
  }

  const items = novels.data.pages.flatMap((page) => page.items);
  const total = novels.data.pages[0]?.total ?? 0;
  if (items.length === 0) {
    return range === 'all' ? (
      <EmptyState
        icon={<History aria-hidden="true" />}
        title="No reading history yet"
        headingLevel={2}
        action={<ButtonLink to="/library">Open your library</ButtonLink>}
      >
        <p>Novels you read appear here, with where you left off.</p>
      </EmptyState>
    ) : (
      <EmptyState
        icon={<SearchX aria-hidden="true" />}
        title="Nothing read in this range"
        headingLevel={2}
        action={<Button onClick={onShowAll}>Show all time</Button>}
      />
    );
  }

  return (
    <section aria-labelledby="history-novels">
      <h2 id="history-novels" className="visually-hidden">
        Novels read
      </h2>
      <NovelRowList>
        {items.map((item) => (
          <li key={item.novel.id}>
            <HistoryNovel item={item} />
          </li>
        ))}
      </NovelRowList>
      <div className={styles.more}>
        <p className={styles.shown}>
          Showing {items.length.toLocaleString()} of {plural(total, 'novel')}
        </p>
        {novels.hasNextPage && (
          <Button onClick={() => void novels.fetchNextPage()} busy={novels.isFetchingNextPage}>
            Load more
          </Button>
        )}
      </div>
    </section>
  );
}

function HistoryNovel({ item }: { item: HistoryNovelItem }) {
  const { novel, chaptersRead, reads, lastChapter, lastReadAt } = item;
  const total = novel.totalChapters;
  const furthest = Math.min(item.furthestChapterNumber, total);
  return (
    <NovelRow
      novel={novel}
      actions={
        <ButtonLink
          to={`/reader/${novel.id}/${item.continueChapterNumber}`}
          variant="primary"
          icon={<BookOpen aria-hidden="true" />}
          aria-label={`Continue reading ${novel.title}`}
        >
          Continue
        </ButtonLink>
      }
    >
      <NovelRowMeta>
        {plural(chaptersRead, 'chapter')} read
        {reads > chaptersRead ? ` · ${plural(reads, 'view')}` : ''}
        {item.inLibrary ? '' : ' · Not in your library'}
      </NovelRowMeta>
      <NovelRowMeta>
        Last read <Link to={`/reader/${novel.id}/${lastChapter.number}`}>{lastChapter.title}</Link>{' '}
        <time dateTime={lastReadAt}>{formatRelativeTime(lastReadAt)}</time>
      </NovelRowMeta>
      <ProgressBar
        label={`Progress in ${novel.title}`}
        value={furthest}
        max={Math.max(total, 1)}
        valueText={`Chapter ${furthest.toLocaleString()} of ${total.toLocaleString()}`}
        size="sm"
      />
    </NovelRow>
  );
}
