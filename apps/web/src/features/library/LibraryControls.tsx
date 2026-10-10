import type { LibraryStatus } from '@webnovel-hub/shared';
import { Star } from 'lucide-react';
import { Select } from '../../components/ui';
import { STATUS_OPTIONS } from '../../lib/reading';
import styles from './LibraryControls.module.css';
import { useSetFavorite, useSetStatus } from './libraryActions';

interface ControlProps {
  novelId: string;
  title: string;
  /** Cards: a smaller control whose label is only read by screen readers. */
  compact?: boolean;
}

/** One status per novel in the library. */
export function StatusSelect({
  novelId,
  title,
  status,
  compact = false,
}: ControlProps & { status: LibraryStatus }) {
  const setStatus = useSetStatus();
  return (
    <div className={compact ? styles.compactSelect : undefined}>
      <Select
        label={compact ? `Status of ${title}` : 'Status'}
        hideLabel={compact}
        options={STATUS_OPTIONS}
        value={status}
        onChange={(event) =>
          setStatus.mutate({ novelId, status: event.target.value as LibraryStatus })
        }
      />
    </div>
  );
}

/**
 * The favourite toggle: a toggle button (`aria-pressed`) with a constant
 * name, whose star fills when on, so the state never rests on colour alone.
 */
export function FavoriteButton({
  novelId,
  title,
  isFavorite,
  compact = false,
}: ControlProps & { isFavorite: boolean }) {
  const setFavorite = useSetFavorite();
  const label = compact ? `Favorite: ${title}` : undefined;
  return (
    <button
      type="button"
      className={compact ? styles.favoriteCompact : styles.favorite}
      aria-pressed={isFavorite}
      aria-label={label}
      title={compact ? (isFavorite ? 'Remove from favorites' : 'Add to favorites') : undefined}
      onClick={() => setFavorite.mutate({ novelId, isFavorite: !isFavorite })}
    >
      <Star
        className={styles.star}
        aria-hidden="true"
        fill={isFavorite ? 'currentColor' : 'none'}
      />
      {!compact && <span>Favorite</span>}
    </button>
  );
}
