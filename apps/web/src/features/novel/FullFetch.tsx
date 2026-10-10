import type { NovelSummary } from '@webnovel-hub/shared';
import { BookDown, CircleAlert, CircleCheck, CircleStop } from 'lucide-react';
import { Button, Notice, ProgressBar, Spinner } from '../../components/ui';
import { plural } from '../../lib/format';
import styles from './NovelPage.module.css';
import type { FullFetchState } from './useFullFetch';

/**
 * "Fetch all chapters" (plan 18). Reading fetches a chapter and the next few; this asks
 * the scraper for every chapter not stored yet. Hidden for EPUB imports, while a fetch
 * waits or runs (its status has Stop), and once every chapter is stored.
 */
export function FullFetchButton({ state }: { state: FullFetchState }) {
  if (!state.available || state.active) return null;
  if (state.storedChapters >= state.totalChapters) return null;
  return (
    <Button
      variant="ghost"
      icon={<BookDown aria-hidden="true" />}
      busy={state.starting}
      onClick={state.start}
    >
      Fetch all chapters
    </Button>
  );
}

/**
 * Where the novel's whole-novel fetch stands: waiting, fetching, or how it ended.
 * `compact` (a row in a list) leaves out the note about pacing.
 */
export function FullFetchStatus({
  novel,
  state,
  compact = false,
}: {
  novel: Pick<NovelSummary, 'source'>;
  state: FullFetchState;
  compact?: boolean;
}) {
  const { active, finished, storedChapters, totalChapters } = state;
  const site = novel.source.name;

  if (active) {
    const stop = active.canCancel && (
      <Button
        size="sm"
        variant="ghost"
        icon={<CircleStop aria-hidden="true" />}
        busy={state.stopping}
        onClick={state.stop}
      >
        Stop
      </Button>
    );
    if (active.status === 'pending') {
      const ahead = active.queuedBehind;
      return (
        <div className={styles.fullFetch} role="status">
          <div className={styles.fullFetchLine}>
            <Spinner decorative />
            <span>
              {ahead > 0
                ? `Waiting to fetch all chapters: ${site} fetches one novel at a time, and ${plural(ahead, 'novel')} ${ahead === 1 ? 'goes' : 'go'} first.`
                : 'Waiting to fetch all chapters…'}
              {active.error && <span className={styles.updateHint}> {active.error.message}</span>}
            </span>
            {stop}
          </div>
        </div>
      );
    }
    const message = active.progressMessage ?? 'Fetching all chapters…';
    return (
      <div className={styles.fullFetch} role="status">
        <div className={styles.fullFetchLine}>
          <Spinner decorative />
          <span>{message}</span>
          {stop}
        </div>
        <ProgressBar
          label="Fetching all chapters"
          value={storedChapters}
          max={totalChapters}
          valueText={`${storedChapters} of ${totalChapters} chapters stored`}
          size="sm"
        />
        {!compact && (
          <p className={styles.fullFetchHint}>
            Chapters arrive one at a time, with long pauses, so {site} isn't overwhelmed. You can
            leave this page; fetching carries on.
          </p>
        )}
      </div>
    );
  }

  if (finished?.status === 'completed') {
    const failed = finished.result?.failed ?? 0;
    return (
      <Notice
        variant="inline"
        tone={failed ? 'neutral' : 'ok'}
        role="status"
        icon={failed ? <CircleAlert aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
      >
        {failed
          ? `Fetched ${plural(finished.result?.fetched ?? 0, 'chapter')}. ${plural(failed, 'chapter')} couldn't be read; the chapter list says why.`
          : storedChapters >= totalChapters
            ? `All ${totalChapters.toLocaleString()} chapters are stored.`
            : `${storedChapters.toLocaleString()} of ${plural(totalChapters, 'chapter')} are stored; new ones came out since.`}
      </Notice>
    );
  }
  if (finished?.status === 'failed') {
    return (
      <Notice tone="warn" role="alert" icon={<CircleAlert aria-hidden="true" />}>
        <strong>Fetching all chapters stopped.</strong>{' '}
        {finished.error?.message ?? 'Something went wrong. Please try again.'}
      </Notice>
    );
  }
  return null;
}
