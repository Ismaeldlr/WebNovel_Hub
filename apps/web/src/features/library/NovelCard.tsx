import type { LibraryItem } from '@webnovel-hub/shared';
import { BookOpen, Trash2, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';
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

  return (
    <article className={styles.card} aria-labelledby={`card-${novel.id}`}>
      <div className={styles.coverWrap}>
        {/* The title below is the link for assistive technology; the cover is a mouse shortcut. */}
        <Link to={novelPath} tabIndex={-1} aria-hidden="true" className={styles.coverLink}>
          <Cover title={novel.title} author={novel.author} coverUrl={novel.coverUrl} />
        </Link>
        {library.newChapterCount > 0 && (
          <span className={styles.newBadge}>
            <Badge tone="accent">{plural(library.newChapterCount, 'new chapter')}</Badge>
          </span>
        )}
      </div>

      <div className={styles.body}>
        <div className={styles.titleRow}>
          <h3 id={`card-${novel.id}`} className={styles.title}>
            <Link to={novelPath}>{novel.title}</Link>
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
