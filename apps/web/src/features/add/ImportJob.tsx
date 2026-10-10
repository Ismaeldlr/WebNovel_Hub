import { type IngestionJob, isJobFinished } from '@webnovel-hub/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, CircleAlert, CircleCheck, RotateCcw } from 'lucide-react';
import { useEffect } from 'react';
import { importsApi } from '../../api/catalog';
import { queryKeys } from '../../app/queryClient';
import { Button, ButtonLink, ErrorState, ProgressBar, Spinner } from '../../components/ui';
import { plural } from '../../lib/format';
import styles from './AddNovelsPage.module.css';

/** How often a running import is polled. */
export const JOB_POLL_MS = 1_500;

interface ImportJobProps {
  jobId: string;
  onRetry: (url: string) => void;
  onDone: () => void;
}

/**
 * A URL import as it happens: waiting, running with the worker's progress,
 * then the novel or a plain-language failure.
 */
export function ImportJob({ jobId, onRetry, onDone }: ImportJobProps) {
  const queryClient = useQueryClient();
  const job = useQuery({
    queryKey: queryKeys.job(jobId),
    queryFn: async ({ signal }) => (await importsApi.job(jobId, signal)) as IngestionJob,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data && isJobFinished(data.status) ? false : JOB_POLL_MS;
    },
  });

  const status = job.data?.status;
  const finished = status !== undefined && isJobFinished(status);
  useEffect(() => {
    if (!finished) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.recentImports });
    if (status === 'completed') {
      // A new novel in the library and the search.
      void queryClient.invalidateQueries({ queryKey: queryKeys.library });
      void queryClient.invalidateQueries({ queryKey: queryKeys.searches });
    }
  }, [finished, status, queryClient]);

  if (job.isPending) {
    return (
      <div className={styles.jobCard}>
        <Spinner label="Checking the import" />
      </div>
    );
  }
  if (job.isError) {
    return (
      <ErrorState
        headingLevel={3}
        title="We lost track of this import"
        message={job.error.message}
        onRetry={() => void job.refetch()}
      />
    );
  }

  const data = job.data;
  if (data.status === 'completed' && data.result) {
    const { novelId, title, chapterCount, duplicate } = data.result;
    return (
      <div className={styles.jobCard} data-tone="success" role="status">
        <CircleCheck className={styles.jobIcon} aria-hidden="true" />
        <div className={styles.jobBody}>
          <h3 className={styles.jobTitle}>
            {duplicate ? `“${title}” was already here` : `Added “${title}”`}
          </h3>
          <p className={styles.jobText}>
            {duplicate
              ? 'It was already in your library, so nothing was imported twice.'
              : `${plural(chapterCount, 'chapter')} are ready. Each one downloads when you first open it.`}
          </p>
          <div className={styles.jobActions}>
            <ButtonLink
              to={`/novels/${novelId}`}
              variant="primary"
              icon={<BookOpen aria-hidden="true" />}
            >
              View novel
            </ButtonLink>
            <Button variant="ghost" onClick={onDone}>
              Import another
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (data.status === 'failed') {
    return (
      <div className={styles.jobCard} data-tone="error" role="alert">
        <CircleAlert className={styles.jobIcon} aria-hidden="true" />
        <div className={styles.jobBody}>
          <h3 className={styles.jobTitle}>The import didn't work</h3>
          <p className={styles.jobText}>
            {data.error?.message ?? 'Something went wrong. Please try again.'}
          </p>
          <div className={styles.jobActions}>
            {data.url && (
              <Button
                variant="primary"
                icon={<RotateCcw aria-hidden="true" />}
                onClick={() => data.url && onRetry(data.url)}
              >
                Try again
              </Button>
            )}
            <Button variant="ghost" onClick={onDone}>
              Import another
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Pending or running.
  const waiting = data.status === 'pending';
  const message = data.progressMessage ?? (waiting ? 'Waiting to start…' : 'Working…');
  return (
    <div className={styles.jobCard} aria-busy="true">
      <Spinner decorative size="lg" />
      <div className={styles.jobBody}>
        <h3 className={styles.jobTitle}>Importing from {data.source?.name ?? 'the source site'}</h3>
        <p className={styles.jobText} role="status">
          {message}
        </p>
        <ProgressBar label="Import progress" value={data.progressPercent} valueText={message} />
        {data.error && <p className={styles.jobHint}>{data.error.message}</p>}
      </div>
    </div>
  );
}
