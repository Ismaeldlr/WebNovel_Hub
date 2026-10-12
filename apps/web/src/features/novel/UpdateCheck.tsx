import type { NovelDetail } from '@webnovel-hub/shared';
import { CircleAlert, CircleCheck, RefreshCw, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';
import { Button, Notice, Spinner } from '../../components/ui';
import { plural } from '../../lib/format';
import styles from './NovelPage.module.css';
import type { UpdateCheckState } from './useUpdateCheck';

/**
 * The "Check for updates" button; hidden for EPUB imports. Phones show a shorter label
 * (the button's name stays the full one).
 */
export function UpdateCheckButton({
  state,
  className,
}: {
  state: UpdateCheckState;
  className?: string;
}) {
  if (!state.available) return null;
  const busy = state.starting || state.active !== null;
  const label = state.active ? 'Checking for updates…' : 'Check for updates';
  return (
    <Button
      variant="ghost"
      icon={<RefreshCw aria-hidden="true" />}
      busy={busy}
      onClick={state.start}
      aria-label={label}
      className={className}
    >
      <span className={styles.longLabel}>{label}</span>
      <span className={styles.shortLabel}>{state.active ? 'Checking…' : 'Updates'}</span>
    </Button>
  );
}

/**
 * What the novel's update check says: its progress while it runs, then what it found, or
 * why the novel's last check failed.
 */
export function UpdateCheckStatus({
  novel,
  state,
}: {
  novel: NovelDetail;
  state: UpdateCheckState;
}) {
  const { active, finished } = state;
  if (active) {
    const message =
      active.progressMessage ??
      (active.status === 'pending' ? 'Waiting to start…' : 'Checking for new chapters…');
    return (
      <Notice as="div" variant="inline" role="status" icon={<Spinner decorative />}>
        {message}
        {active.error && <span className={styles.updateHint}> {active.error.message}</span>}
      </Notice>
    );
  }
  if (finished?.status === 'completed') {
    const found = finished.newChaptersFound;
    return (
      <Notice variant="inline" tone="ok" role="status" icon={<CircleCheck aria-hidden="true" />}>
        {found > 0 ? (
          <>
            Found {plural(found, 'new chapter')}.{' '}
            <Link to="?order=desc" className={styles.newLink}>
              Show the newest
            </Link>
          </>
        ) : (
          'No new chapters since the last check.'
        )}
      </Notice>
    );
  }
  if (novel.updateFailure) {
    return (
      <Notice tone="warn" role="note" icon={<TriangleAlert aria-hidden="true" />}>
        <strong>The last check for new chapters failed.</strong> {novel.updateFailure.message}
      </Notice>
    );
  }
  if (finished?.status === 'failed') {
    return (
      <Notice tone="warn" role="alert" icon={<CircleAlert aria-hidden="true" />}>
        <strong>The check for new chapters failed.</strong>{' '}
        {finished.error?.message ?? 'Something went wrong. Please try again.'}
      </Notice>
    );
  }
  return null;
}
