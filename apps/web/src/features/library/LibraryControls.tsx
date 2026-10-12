import type { LibraryStatus } from '@webnovel-hub/shared';
import { Bookmark, ChevronDown, Star } from 'lucide-react';
import { Select } from '../../components/ui';
import { STATUS_LABELS, STATUS_OPTIONS } from '../../lib/reading';
import styles from './LibraryControls.module.css';
import { useSetFavorite, useSetStatus } from './libraryActions';

interface ControlProps {
  novelId: string;
  title: string;
  /** Cards: a smaller control whose label is only read by screen readers. */
  compact?: boolean;
  /** Extra classes, e.g. for a row of actions. */
  className?: string;
}

/**
 * One status per novel in the library. `button`: a native select dressed as a button that
 * shows the status, for a row of actions; screen readers hear "Status".
 */
export function StatusSelect({
  novelId,
  title,
  status,
  compact = false,
  button = false,
  className,
}: ControlProps & { status: LibraryStatus; button?: boolean }) {
  const setStatus = useSetStatus();
  if (button) {
    return (
      <span className={[styles.statusButton, className].filter(Boolean).join(' ')}>
        <Bookmark aria-hidden="true" />
        <span className={styles.statusText} aria-hidden="true">
          {STATUS_LABELS[status]}
          <ChevronDown className={styles.chevron} />
        </span>
        <select
          aria-label="Status"
          value={status}
          onChange={(event) =>
            setStatus.mutate({ novelId, status: event.target.value as LibraryStatus })
          }
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </span>
    );
  }
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
  className,
}: ControlProps & { isFavorite: boolean }) {
  const setFavorite = useSetFavorite();
  const label = compact ? `Favorite: ${title}` : undefined;
  return (
    <button
      type="button"
      className={[compact ? styles.favoriteCompact : styles.favorite, className]
        .filter(Boolean)
        .join(' ')}
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
