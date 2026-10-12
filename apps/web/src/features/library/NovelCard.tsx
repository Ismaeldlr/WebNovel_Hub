import type { LibraryItem } from '@webnovel-hub/shared';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, Trash2, TriangleAlert } from 'lucide-react';
import { type MouseEvent, type RefObject, useRef } from 'react';
import { Link, useNavigate } from 'react-router';
import { novelsApi } from '../../api/catalog';
import { queryKeys } from '../../app/queryClient';
import { Cover } from '../../components/Cover';
import { Badge, ButtonLink, IconButton, ProgressBar } from '../../components/ui';
import { plural } from '../../lib/format';
import { progress, readingTarget } from '../../lib/reading';
import { FavoriteButton, StatusSelect } from './LibraryControls';
import styles from './NovelCard.module.css';

interface NovelCardProps {
  item: LibraryItem;
  onRemove: (item: LibraryItem) => void;
}

/** A novel in the library. */
export function NovelCard({ item, onRemove }: NovelCardProps) {
  const { novel, library } = item;
  const target = readingTarget(novel.id, library);
  const { reached, total } = progress(library, novel.totalChapters);
  const novelPath = `/novels/${novel.id}`;
  const coverRef = useRef<HTMLAnchorElement>(null);
  const openNovel = useOpenNovel(novel.id, coverRef);

  return (
    <article className={styles.card} aria-labelledby={`card-${novel.id}`}>
      <div className={styles.coverWrap}>
        {/* The title below is the link for assistive technology; the cover is a mouse shortcut. */}
        <Link
          ref={coverRef}
          to={novelPath}
          tabIndex={-1}
          aria-hidden="true"
          className={styles.coverLink}
          onClick={openNovel}
        >
          <Cover title={novel.title} author={novel.author} coverUrl={novel.coverUrl} />
        </Link>
        {/* Phones: the progress along the cover's bottom edge (the text says it too). */}
        <span className={styles.coverProgress} aria-hidden="true">
          <span style={{ width: `${total > 0 ? (reached / total) * 100 : 0}%` }} />
        </span>
        {library.newChapterCount > 0 && (
          <span className={styles.newBadge}>
            <Badge tone="accent">{plural(library.newChapterCount, 'new chapter')}</Badge>
          </span>
        )}
      </div>

      <div className={styles.body}>
        <div className={styles.titleRow}>
          <h3 id={`card-${novel.id}`} className={styles.title}>
            <Link to={novelPath} onClick={openNovel}>
              {novel.title}
            </Link>
          </h3>
          <FavoriteButton
            novelId={novel.id}
            title={novel.title}
            isFavorite={library.isFavorite}
            compact
          />
        </div>
        {novel.author && <p className={styles.author}>{novel.author}</p>}
        <p className={styles.badges}>
          <Badge>{novel.source.name}</Badge>
          {novel.updateFailure && (
            <Badge tone="warn" icon={<TriangleAlert aria-hidden="true" />}>
              Update failed
            </Badge>
          )}
        </p>

        <div className={styles.progress}>
          <ProgressBar
            size="sm"
            label={`Reading progress of ${novel.title}`}
            value={reached}
            max={Math.max(total, 1)}
            valueText={`Chapter ${reached} of ${total}`}
          />
          <span className={styles.progressText}>
            Ch. {reached.toLocaleString()} / {total.toLocaleString()}
          </span>
        </div>

        <StatusSelect novelId={novel.id} title={novel.title} status={library.status} compact />

        <div className={styles.actions}>
          <ButtonLink
            to={target.to}
            variant="primary"
            size="sm"
            icon={<BookOpen aria-hidden="true" />}
            aria-label={`${target.label} ${novel.title}, chapter ${target.chapter}`}
            className={styles.read}
          >
            {target.label}
          </ButtonLink>
          <IconButton size="sm" label={`Delete ${novel.title}`} onClick={() => onRemove(item)}>
            <Trash2 aria-hidden="true" />
          </IconButton>
        </div>
      </div>
    </article>
  );
}

/** How long opening a novel waits for its details, and then for its page, before going on. */
const PREFETCH_WAIT_MS = 300;
const PAGE_WAIT_MS = 500;

/** Resolves once `selector` matches something on the page, or after `timeoutMs`. */
function whenShown(selector: string, timeoutMs: number): Promise<void> {
  const start = performance.now();
  return new Promise((resolve) => {
    const check = () => {
      if (document.querySelector(selector) || performance.now() - start > timeoutMs) resolve();
      else setTimeout(check, 16);
    };
    check();
  });
}

/**
 * Opens the novel with its cover growing into the novel page's (a view transition), where
 * the browser can and motion isn't reduced. The novel's details are fetched first, for a
 * moment at most, so the page draws its header straight away; the transition then waits
 * for that header before showing the new page.
 */
function useOpenNovel(novelId: string, coverRef: RefObject<HTMLElement | null>) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      !('startViewTransition' in document) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    const details = queryClient.prefetchQuery({
      queryKey: queryKeys.novel(novelId),
      queryFn: ({ signal }) => novelsApi.get(novelId, signal),
    });
    const wait = new Promise((resolve) => setTimeout(resolve, PREFETCH_WAIT_MS));
    void Promise.race([details, wait]).then(() => {
      coverRef.current?.style.setProperty('view-transition-name', 'novel-cover');
      const transition = document.startViewTransition(async () => {
        void navigate(`/novels/${novelId}`);
        await whenShown('#novel-title', PAGE_WAIT_MS);
      });
      // A transition the browser skips still navigates; nothing to report.
      transition.ready.catch(() => undefined);
      transition.finished.catch(() => undefined);
    });
  };
}
