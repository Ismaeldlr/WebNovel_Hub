import type { LibraryState, LibraryStatus } from '@webnovel-hub/shared';
import { Bell, Bookmark, ChevronDown, Star } from 'lucide-react';
import { Select, useToast } from '../../components/ui';
import { STATUS_LABELS, STATUS_OPTIONS } from '../../lib/reading';
import {
  allowNotifications,
  checkedByStatus,
  notifyChoice,
  novelNotified,
} from '../notifications/notifyState';
import { usePreferences } from '../preferences/usePreferences';
import styles from './LibraryControls.module.css';
import { useSetFavorite, useSetNotify, useSetStatus } from './libraryActions';

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

/**
 * Whether the reader is told about the novel's new chapters: a bell like the favourite's
 * star, saving the novel's own choice. The toast says what it means, as the bell alone
 * doesn't (a novel not read or followed is then checked too; one turned off still is).
 */
export function NotifyButton({
  novelId,
  title,
  library,
  className,
}: Omit<ControlProps, 'compact'> & { library: LibraryState }) {
  const preferences = usePreferences().data;
  const setNotify = useSetNotify();
  const toast = useToast();
  if (!preferences) return null;
  const on = novelNotified(library, preferences);

  const toggle = () => {
    const next = !on;
    const told = next
      ? {
          title: `You'll be told about new chapters of ${title}`,
          description: !preferences.notifyNewChapters
            ? 'New-chapter notifications are off in Settings, so none show until you turn them on.'
            : checkedByStatus(library.status)
              ? undefined
              : "It's checked for new chapters too, though you aren't reading or following it.",
        }
      : {
          title: `No more notifications for ${title}`,
          description: checkedByStatus(library.status)
            ? 'Its new chapters still show in your library.'
            : undefined,
        };
    setNotify.mutate({ novelId, notify: notifyChoice(next, library, preferences), told });
    if (!next) return;
    void allowNotifications().then((allowed) => {
      if (!allowed) {
        toast({
          title: 'Notifications are off for Webnovel Hub',
          description: "Turn them on in Android's settings for the app.",
          tone: 'error',
        });
      }
    });
  };

  return (
    <button
      type="button"
      className={[styles.favorite, className].filter(Boolean).join(' ')}
      aria-pressed={on}
      aria-label="Notify me about new chapters"
      title={
        on
          ? 'You are told about new chapters'
          : checkedByStatus(library.status)
            ? 'New chapters show in your library, without a notification'
            : 'Not checked for new chapters: turn on to be told about them'
      }
      onClick={toggle}
    >
      <Bell className={styles.star} aria-hidden="true" fill={on ? 'currentColor' : 'none'} />
      <span>Notify</span>
    </button>
  );
}
