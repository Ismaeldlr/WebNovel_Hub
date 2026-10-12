import type { NovelDetail } from '@webnovel-hub/shared';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, ExternalLink, SearchX } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { novelsApi } from '../../api/catalog';
import { ApiError } from '../../api/client';
import { libraryTagPath } from '../../app/navigation';
import { queryKeys } from '../../app/queryClient';
import { Cover } from '../../components/Cover';
import {
  Badge,
  ButtonLink,
  EmptyState,
  ErrorState,
  ProgressBar,
  Spinner,
} from '../../components/ui';
import { formatDate, formatRelativeTime, plural } from '../../lib/format';
import { usePageTitle } from '../../lib/hooks';
import { progress, readingTarget } from '../../lib/reading';
import { FavoriteButton, StatusSelect } from '../library/LibraryControls';
import { ChapterList } from './ChapterList';
import { Description } from './Description';
import styles from './NovelPage.module.css';
import { ExportButton } from '../exports/ExportButton';
import { DeleteNovel, ManageButtons } from './ManageNovel';
import { FullFetchButton, FullFetchStatus } from './FullFetch';
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
  return <NovelView novel={novel.data} />;
}

function NovelView({ novel }: { novel: NovelDetail }) {
  const { library } = novel;
  const target = readingTarget(novel.id, library);
  const updates = useUpdateCheck(novel);
  const fullFetch = useFullFetch(novel);

  return (
    <article className={styles.page} aria-labelledby="novel-title">
      <header className={styles.hero}>
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
          <p className={styles.source}>
            <Badge>{novel.source.name}</Badge>
            {novel.sourceUrl && (
              <a
                href={novel.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.sourceLink}
              >
                View on {novel.source.name}
                <ExternalLink aria-hidden="true" />
                <span className="visually-hidden"> (opens in a new tab)</span>
              </a>
            )}
          </p>
          <h1 id="novel-title" className={styles.title}>
            {novel.title}
          </h1>
          {novel.author && <p className={styles.author}>by {novel.author}</p>}
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
          <dl className={styles.facts}>
            <div>
              <dt>Chapters</dt>
              <dd>{novel.totalChapters.toLocaleString()}</dd>
            </div>
            {novel.latestChapterAt && (
              <div>
                <dt>Latest chapter</dt>
                <dd>{formatRelativeTime(novel.latestChapterAt)}</dd>
              </div>
            )}
            <div>
              <dt>Checked for updates</dt>
              <dd>{novel.lastCheckedAt ? formatRelativeTime(novel.lastCheckedAt) : 'Not yet'}</dd>
            </div>
            <div>
              <dt>Added</dt>
              <dd>{formatDate(novel.createdAt)}</dd>
            </div>
          </dl>
        </div>
      </header>

      <section className={styles.actions} aria-label="Reading and library">
        <ButtonLink
          to={target.to}
          variant="primary"
          icon={<BookOpen aria-hidden="true" />}
          aria-label={`${target.label} at chapter ${target.chapter}`}
        >
          {target.label}
          {library?.lastReadChapterNumber ? ` · Ch. ${target.chapter}` : ''}
        </ButtonLink>
        {library && (
          <>
            <div className={styles.status}>
              <StatusSelect novelId={novel.id} title={novel.title} status={library.status} />
            </div>
            <FavoriteButton
              novelId={novel.id}
              title={novel.title}
              isFavorite={library.isFavorite}
            />
          </>
        )}
        <UpdateCheckButton state={updates} />
        <FullFetchButton state={fullFetch} />
        <ExportButton
          novel={novel}
          storedChapters={fullFetch.storedChapters}
          totalChapters={fullFetch.totalChapters}
        />
        <ManageButtons novel={novel} />
        <DeleteNovel novel={novel} />
      </section>
      <UpdateCheckStatus novel={novel} state={updates} />
      <FullFetchStatus novel={novel} state={fullFetch} />

      {library && <Progress novel={novel} />}

      <section className={styles.section} aria-labelledby="novel-about">
        <h2 id="novel-about" className={styles.sectionTitle}>
          About this novel
        </h2>
        {novel.description ? (
          <Description text={novel.description} />
        ) : (
          <p className={styles.muted}>{novel.source.name} gives no description for this novel.</p>
        )}
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

/** The progress section. */
function Progress({ novel }: { novel: NovelDetail }) {
  const { library } = novel;
  const { reached, total, percent } = progress(library, novel.totalChapters);
  if (!library) return null;
  return (
    <section className={styles.progress} aria-labelledby="novel-progress">
      <h2 id="novel-progress" className="visually-hidden">
        Your progress
      </h2>
      <div className={styles.progressHead}>
        <p>
          <strong>
            {reached === 0
              ? 'Not started'
              : `Chapter ${reached.toLocaleString()} of ${total.toLocaleString()}`}
          </strong>
          {reached > 0 && <span className={styles.muted}> · {percent}%</span>}
        </p>
        <p className={styles.muted}>
          {library.lastReadAt
            ? `Last read ${formatRelativeTime(library.lastReadAt)}`
            : `Added ${formatRelativeTime(library.addedAt)}`}
          {library.newChapterCount > 0 && (
            <>
              {' · '}
              <Link to="?order=desc" className={styles.newLink}>
                {plural(library.newChapterCount, 'new chapter')}
              </Link>
            </>
          )}
        </p>
      </div>
      <ProgressBar
        label="Reading progress"
        value={reached}
        max={Math.max(total, 1)}
        valueText={`Chapter ${reached} of ${total}`}
      />
    </section>
  );
}
