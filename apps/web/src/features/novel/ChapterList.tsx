import { CHAPTER_PAGE_LIMITS, type ChapterSummary } from '@webnovel-hub/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowDownUp, Check, ChevronLeft, ChevronRight, CircleAlert, Search } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { Link } from 'react-router';
import { novelsApi } from '../../api/catalog';
import { queryKeys } from '../../app/queryClient';
import { Badge, Button, ErrorState, Select, Spinner } from '../../components/ui';
import { formatDate } from '../../lib/format';
import { useSearchText } from '../../lib/hooks';
import { readerPath } from '../../lib/reading';
import styles from './ChapterList.module.css';
import { type ChapterListState, useChapterParams } from './chapterListState';

const PAGE_SIZE = CHAPTER_PAGE_LIMITS.default;

interface ChapterListProps {
  novelId: string;
  totalChapters: number;
}

/** The novel page's chapter list, its place kept in the address. */
export function ChapterList({ novelId, totalChapters }: ChapterListProps) {
  return (
    <ChapterListView novelId={novelId} totalChapters={totalChapters} state={useChapterParams()} />
  );
}

interface ChapterListViewProps extends ChapterListProps {
  state: ChapterListState;
  /** The chapter being read: marked, and scrolled into view. */
  current?: number;
  /**
   * Called as a chapter is opened: the reader's list closes, and the chapter takes the
   * open one's place (back still goes to the novel).
   */
  onOpen?: () => void;
}

/**
 * The chapter list: pages of 50, search by title or number,
 * oldest or newest first, with read, NEW and failed-download markers. The novel page and
 * the reader both show it.
 */
export function ChapterListView({
  novelId,
  totalChapters,
  state,
  current,
  onOpen,
}: ChapterListViewProps) {
  const { page, order, q, update } = state;
  const rowsRef = useRef<HTMLOListElement>(null);
  // Search as the reader types, a moment after they stop.
  const [search, setSearch] = useSearchText(q, (text) => update({ q: text, page: 1 }));
  const searchId = useId();

  const params = { page, limit: PAGE_SIZE, order, q };
  const chapters = useQuery({
    queryKey: queryKeys.chapters(novelId, params),
    queryFn: ({ signal }) => novelsApi.chapters(novelId, params, signal),
    placeholderData: keepPreviousData,
  });

  const total = chapters.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // The chapter being read comes into view when its page shows.
  const shown = chapters.data;
  useEffect(() => {
    if (current === undefined || !shown) return;
    rowsRef.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView?.({ block: 'center' });
  }, [current, shown]);

  return (
    <div className={styles.list}>
      <div className={styles.toolbar} role="search">
        <label htmlFor={searchId} className="visually-hidden">
          Search chapters by title or number
        </label>
        <div className={styles.search}>
          <Search className={styles.searchIcon} aria-hidden="true" />
          <input
            id={searchId}
            type="search"
            className={styles.searchInput}
            placeholder={`Search ${totalChapters.toLocaleString()} chapters`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Button
          size="sm"
          icon={<ArrowDownUp aria-hidden="true" />}
          onClick={() => update({ order: order === 'asc' ? 'desc' : 'asc', page: 1 })}
        >
          {order === 'asc' ? 'Oldest first' : 'Newest first'}
        </Button>
      </div>

      {chapters.isPending ? (
        <div className={styles.status}>
          <Spinner label="Loading chapters" />
        </div>
      ) : chapters.isError ? (
        <ErrorState
          headingLevel={3}
          title="The chapters didn't load"
          message={chapters.error.message}
          onRetry={() => void chapters.refetch()}
        />
      ) : chapters.data.chapters.length === 0 ? (
        <p className={styles.status}>
          {q ? `No chapter matches “${q}”.` : 'This novel has no chapters yet.'}
        </p>
      ) : (
        <ol ref={rowsRef} className={styles.rows} aria-busy={chapters.isFetching || undefined}>
          {chapters.data.chapters.map((chapter) => (
            <ChapterRow
              key={chapter.id}
              novelId={novelId}
              chapter={chapter}
              current={chapter.number === current}
              onOpen={onOpen}
            />
          ))}
        </ol>
      )}

      {total > PAGE_SIZE && (
        <nav className={styles.pager} aria-label="Chapter pages">
          <Button
            size="sm"
            variant="ghost"
            icon={<ChevronLeft aria-hidden="true" />}
            disabled={page <= 1}
            onClick={() => update({ page: page - 1 })}
          >
            Previous
          </Button>
          <div className={styles.pageSelect}>
            <Select
              label="Page"
              hideLabel
              value={String(page)}
              onChange={(event) => update({ page: Number(event.target.value) })}
              options={Array.from({ length: pages }, (_, index) => {
                const first = index * PAGE_SIZE + 1;
                const last = Math.min(total, (index + 1) * PAGE_SIZE);
                return {
                  value: String(index + 1),
                  label: `Page ${index + 1} of ${pages} (${first.toLocaleString()}–${last.toLocaleString()})`,
                };
              })}
            />
          </div>
          <Button
            size="sm"
            variant="ghost"
            disabled={page >= pages}
            onClick={() => update({ page: page + 1 })}
            iconEnd={<ChevronRight aria-hidden="true" />}
          >
            Next
          </Button>
        </nav>
      )}
    </div>
  );
}

interface ChapterRowProps {
  novelId: string;
  chapter: ChapterSummary;
  current: boolean;
  onOpen?: () => void;
}

function ChapterRow({ novelId, chapter, current, onOpen }: ChapterRowProps) {
  return (
    <li className={styles.row} data-read={chapter.isRead || undefined}>
      <Link
        to={readerPath(novelId, chapter.number)}
        replace={onOpen !== undefined}
        className={styles.link}
        aria-current={current ? 'page' : undefined}
        onClick={onOpen}
      >
        <span className={styles.number}>{chapter.number.toLocaleString()}</span>
        <span className={styles.title}>{chapter.title}</span>
        <span className={styles.markers}>
          {chapter.isNew && <Badge tone="accent">New</Badge>}
          {chapter.fetchFailure && (
            <span title={chapter.fetchFailure.message}>
              <Badge tone="danger" icon={<CircleAlert aria-hidden="true" />}>
                Download failed
              </Badge>
            </span>
          )}
          {chapter.isRead && (
            <span className={styles.read}>
              <Check aria-hidden="true" />
              Read
            </span>
          )}
        </span>
        {chapter.publishedAt && (
          <time className={styles.date} dateTime={chapter.publishedAt}>
            {formatDate(chapter.publishedAt)}
          </time>
        )}
      </Link>
    </li>
  );
}
