import type { NovelDetail } from '@webnovel-hub/shared';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, EyeOff, ExternalLink, SearchX } from 'lucide-react';
import { type RefObject, useRef } from 'react';
import { Link, useParams } from 'react-router';
import { novelsApi } from '../../api/catalog';
import { ApiError } from '../../api/client';
import { libraryShelfPath, libraryTagPath } from '../../app/navigation';
import { queryKeys } from '../../app/queryClient';
import { Cover, CoverBackdrop } from '../../components/Cover';
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  ErrorState,
  Notice,
  Spinner,
} from '../../components/ui';
import { formatDate, formatRelativeTime, plural } from '../../lib/format';
import { usePageBar, usePageTitle, useUnderTopBar } from '../../lib/hooks';
import { progress, readingTarget } from '../../lib/reading';
import { FavoriteButton, NotifyButton, StatusSelect } from '../library/LibraryControls';
import { useSetHidden } from '../library/libraryActions';
import { useShelves } from '../library/shelfActions';
import { ChapterList } from './ChapterList';
import { Description } from './Description';
import styles from './NovelPage.module.css';
import { MoreActions } from './ManageNovel';
import { FullFetchStatus } from './FullFetch';
import { UpdateCheckButton, UpdateCheckStatus } from './UpdateCheck';
import { useFullFetch } from './useFullFetch';
import { useUpdateCheck } from './useUpdateCheck';

/** The novel detail page. */
export function NovelPage() {
  const { novelId = '' } = useParams();
  const novel = useQuery({
    queryKey: queryKeys.novel(novelId),
    queryFn: ({ signal }) => novelsApi.get(novelId, signal),
  });
  usePageTitle(novel.data?.title ?? 'Novel');
  // Phones: a back button, and the cover shows through the top bar until the title
  // scrolls under it.
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleUnderBar = useUnderTopBar(titleRef, novel.isSuccess);
  usePageBar({ back: true, clear: novel.isSuccess && !titleUnderBar });

  if (novel.isPending) {
    return (
      <div className={styles.loading}>
        <Spinner size="lg" label="Loading the novel" />
      </div>
    );
  }
  if (novel.isError) {
    if (novel.error instanceof ApiError && novel.error.status === 404) {
      return (
        <EmptyState
          icon={<SearchX aria-hidden="true" />}
          title="This novel isn't in your library"
          action={
            <ButtonLink to="/library" variant="primary">
              Back to My Library
            </ButtonLink>
          }
        >
          <p>It may have been removed, or the address may be mistyped.</p>
        </EmptyState>
      );
    }
    return (
      <ErrorState
        title="This novel didn't load"
        message={novel.error.message}
        onRetry={() => void novel.refetch()}
        retrying={novel.isFetching}
      />
    );
  }
  return <NovelView novel={novel.data} titleRef={titleRef} />;
}

function NovelView({
  novel,
  titleRef,
}: {
  novel: NovelDetail;
  titleRef: RefObject<HTMLHeadingElement | null>;
}) {
  const { library } = novel;
  const target = readingTarget(novel.id, library);
  const { percent } = progress(library, novel.totalChapters);
  const updates = useUpdateCheck(novel);
  const fullFetch = useFullFetch(novel);
  const setHidden = useSetHidden();
  // Its shelves, in the reader's order.
  const shelves = (useShelves().data ?? []).filter((shelf) => library?.shelfIds.includes(shelf.id));

  const notes = [
    library?.lastReadAt && `Last read ${formatRelativeTime(library.lastReadAt)}`,
    updates.available &&
      (novel.lastCheckedAt
        ? `Checked for updates ${formatRelativeTime(novel.lastCheckedAt)}`
        : 'Not checked for updates yet'),
    `Added ${formatDate(novel.createdAt)}`,
  ].filter(Boolean);

  return (
    <article className={styles.page} aria-labelledby="novel-title">
      <header className={styles.hero}>
        <CoverBackdrop coverUrl={novel.coverUrl} className={styles.backdrop} />
        <div className={styles.heroCover}>
          <Cover
            title={novel.title}
            author={novel.author}
            coverUrl={novel.coverUrl}
            size="lg"
            eager
          />
        </div>
        <div className={styles.heroText}>
          <h1 ref={titleRef} id="novel-title" className={styles.title}>
            {novel.title}
          </h1>
          {novel.author && <p className={styles.author}>by {novel.author}</p>}
          <p className={styles.source}>
            {novel.sourceUrl ? (
              <a
                href={novel.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.sourcePill}
                aria-label={`View on ${novel.source.name} (opens in a new tab)`}
              >
                {novel.source.name}
                <ExternalLink aria-hidden="true" />
              </a>
            ) : (
              <span className={styles.sourcePill}>{novel.source.name}</span>
            )}
          </p>
        </div>
        <dl className={styles.facts}>
          <div>
            <dt>Chapters</dt>
            <dd>{novel.totalChapters.toLocaleString()}</dd>
          </div>
          {library && library.newChapterCount > 0 && (
            <div>
              <dt>New</dt>
              <dd>
                <Link
                  to="?order=desc"
                  className={styles.newLink}
                  aria-label={plural(library.newChapterCount, 'new chapter')}
                >
                  {library.newChapterCount.toLocaleString()}
                </Link>
              </dd>
            </div>
          )}
          {novel.latestChapterAt && (
            <div>
              <dt>Latest chapter</dt>
              <dd>{formatRelativeTime(novel.latestChapterAt)}</dd>
            </div>
          )}
          {library && (
            <div>
              <dt>Read</dt>
              <dd>{percent}%</dd>
            </div>
          )}
        </dl>
      </header>

      <section className={styles.actions} aria-label="Reading and library">
        <ButtonLink
          to={target.to}
          variant="primary"
          icon={<BookOpen aria-hidden="true" />}
          aria-label={`${target.label} at chapter ${target.chapter}`}
          className={styles.read}
        >
          {target.label}
          {library?.lastReadChapterNumber ? ` · Ch. ${target.chapter}` : ''}
        </ButtonLink>
        <div className={styles.actionRow}>
          {library && (
            <>
              <StatusSelect
                novelId={novel.id}
                title={novel.title}
                status={library.status}
                button
                className={styles.action}
              />
              <FavoriteButton
                novelId={novel.id}
                title={novel.title}
                isFavorite={library.isFavorite}
                className={styles.action}
              />
              {/* EPUB imports have no site to check for new chapters. */}
              {updates.available && (
                <NotifyButton
                  novelId={novel.id}
                  title={novel.title}
                  library={library}
                  className={styles.action}
                />
              )}
            </>
          )}
          <UpdateCheckButton state={updates} className={styles.action} />
          <MoreActions novel={novel} fullFetch={fullFetch} className={styles.action} />
        </div>
      </section>
      {library?.hidden && (
        <Notice as="div" icon={<EyeOff aria-hidden="true" />}>
          <p>
            Hidden from your library: it shows only under Hidden, and its new chapters stay quiet.
          </p>
          <div className={styles.noticeActions}>
            <Button
              size="sm"
              busy={setHidden.isPending}
              onClick={() =>
                setHidden.mutate({ novelId: novel.id, hidden: false, title: novel.title })
              }
            >
              Show in library
            </Button>
          </div>
        </Notice>
      )}
      <UpdateCheckStatus novel={novel} state={updates} />
      <FullFetchStatus novel={novel} state={fullFetch} />

      <section className={styles.section} aria-labelledby="novel-about">
        <h2 id="novel-about" className={styles.sectionTitle}>
          About this novel
        </h2>
        {novel.description ? (
          <Description text={novel.description} />
        ) : (
          <p className={styles.muted}>{novel.source.name} gives no description for this novel.</p>
        )}
        {shelves.length > 0 && (
          <ul className={styles.tags} aria-label="Shelves">
            {shelves.map((shelf) => (
              <li key={shelf.id}>
                <Link
                  to={libraryShelfPath(shelf.id)}
                  className={styles.tagLink}
                  aria-label={`${shelf.name}: show the shelf`}
                >
                  <Badge tone="accent">{shelf.name}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {novel.tags.length > 0 && (
          <ul className={styles.tags} aria-label="Tags">
            {novel.tags.map((tag) => (
              <li key={tag}>
                <Link
                  to={libraryTagPath(tag)}
                  className={styles.tagLink}
                  aria-label={`${tag}: show your novels with this tag`}
                >
                  <Badge>{tag}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className={styles.notes}>{notes.join(' · ')}</p>
      </section>

      <section className={styles.section} aria-labelledby="novel-chapters">
        <h2 id="novel-chapters" className={styles.sectionTitle}>
          Chapters{' '}
          <span className={styles.sectionCount}>{novel.totalChapters.toLocaleString()}</span>
        </h2>
        <ChapterList novelId={novel.id} totalChapters={novel.totalChapters} />
      </section>
    </article>
  );
}
