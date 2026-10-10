import {
  type JobStatus,
  UPDATE_RUN_PAGE_LIMITS,
  type UpdateRun,
  isJobFinished,
} from '@webnovel-hub/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Clock,
  LoaderCircle,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { Link } from 'react-router';
import { updatesApi } from '../../api/catalog';
import { queryKeys } from '../../app/queryClient';
import {
  Badge,
  type BadgeTone,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../components/ui';
import { formatDate, formatDuration, formatRelativeTime, plural } from '../../lib/format';
import { PageHeader } from '../pages/PageHeader';
import styles from './UpdateJobsPage.module.css';

/** How often the list is refreshed while a run waits or runs. */
export const UPDATE_RUNS_POLL_MS = 5_000;

const STATUS: Record<JobStatus, { label: string; tone: BadgeTone; icon: ReactNode }> = {
  pending: { label: 'Waiting', tone: 'neutral', icon: <Clock aria-hidden="true" /> },
  running: { label: 'Running', tone: 'accent', icon: <LoaderCircle aria-hidden="true" /> },
  completed: { label: 'Done', tone: 'ok', icon: <CircleCheck aria-hidden="true" /> },
  failed: { label: 'Failed', tone: 'danger', icon: <CircleAlert aria-hidden="true" /> },
};

/**
 * Update Jobs: every scheduled check and the reader's own manual
 * checks, with what each found and which novels failed.
 */
export function UpdateJobsPage() {
  const runs = useInfiniteQuery({
    queryKey: queryKeys.updateRuns,
    queryFn: ({ pageParam, signal }) =>
      updatesApi.runs(pageParam, UPDATE_RUN_PAGE_LIMITS.default, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) => page.items.some((run) => !isJobFinished(run.status)))
        ? UPDATE_RUNS_POLL_MS
        : false,
  });
  const items = runs.data?.pages.flatMap((page) => page.items) ?? [];
  const total = runs.data?.pages[0]?.total ?? 0;

  return (
    <>
      <PageHeader
        title="Update Jobs"
        lead="The checks for new chapters in the novels you read or follow, and what each one found."
      />
      <p className={styles.intro}>
        Novels you have in <strong>Reading</strong> or <strong>Following</strong> are checked on a
        schedule. To check one novel now, open it and choose <em>Check for updates</em>.
      </p>

      {runs.isPending ? (
        <LoadingState label="Loading the update checks" />
      ) : runs.isError ? (
        <ErrorState
          title="The update checks didn't load"
          message={runs.error.message}
          onRetry={() => void runs.refetch()}
          retrying={runs.isFetching}
        />
      ) : items.length === 0 ? (
        <EmptyState icon={<RefreshCw aria-hidden="true" />} title="No checks yet">
          <p>
            The first scheduled check runs as soon as the scraper starts, and its results will be
            listed here.
          </p>
        </EmptyState>
      ) : (
        <section aria-labelledby="update-runs">
          <h2 id="update-runs" className="visually-hidden">
            Update checks, newest first
          </h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Check</th>
                <th scope="col">Status</th>
                <th scope="col">When</th>
                <th scope="col" className={styles.number}>
                  Novels checked
                </th>
                <th scope="col" className={styles.number}>
                  New chapters
                </th>
              </tr>
            </thead>
            {items.map((run) => (
              <RunRows key={run.id} run={run} />
            ))}
          </table>
          <div className={styles.more}>
            <p className={styles.count} aria-live="polite">
              Showing {items.length.toLocaleString()} of {plural(total, 'check')}
            </p>
            {runs.hasNextPage && (
              <Button onClick={() => void runs.fetchNextPage()} busy={runs.isFetchingNextPage}>
                Load more
              </Button>
            )}
          </div>
        </section>
      )}
    </>
  );
}

/** One run: its row, and the novels that failed in a row that opens below it. */
function RunRows({ run }: { run: UpdateRun }) {
  const [open, setOpen] = useState(false);
  const errorsId = useId();
  const status = STATUS[run.status];
  const active = !isJobFinished(run.status);
  // A manual check is about one novel: its failure is the run's own, shown in Status.
  const failures = run.trigger === 'scheduled' ? run.errors : [];

  return (
    <tbody className={styles.run}>
      <tr>
        <th scope="row" data-label="Check">
          {run.novel ? (
            <>
              Check of <Link to={`/novels/${run.novel.id}`}>{run.novel.title}</Link>
            </>
          ) : (
            'Scheduled check'
          )}
          <span className={styles.detail}>
            {run.trigger === 'scheduled' ? 'Novels in Reading or Following' : 'Started by you'}
          </span>
        </th>
        <td data-label="Status">
          <Badge tone={status.tone} icon={status.icon}>
            {status.label}
          </Badge>
          {active && run.progressMessage && (
            <span className={styles.detail}>{run.progressMessage}</span>
          )}
          {run.error && (
            <span className={styles.detail} data-tone={active ? 'warn' : 'danger'}>
              {run.error.message}
            </span>
          )}
          {failures.length > 0 && (
            <button
              type="button"
              className={styles.toggle}
              aria-expanded={open}
              aria-controls={errorsId}
              onClick={() => setOpen((value) => !value)}
            >
              <TriangleAlert aria-hidden="true" />
              {plural(failures.length, 'novel')} of yours failed
              <ChevronDown aria-hidden="true" className={styles.chevron} />
            </button>
          )}
        </td>
        <td data-label="When">
          <time dateTime={run.createdAt} title={formatDate(run.createdAt)}>
            {formatRelativeTime(run.createdAt)}
          </time>
          {run.startedAt && run.finishedAt && (
            <span className={styles.detail}>
              took {formatDuration(run.startedAt, run.finishedAt)}
            </span>
          )}
        </td>
        <td data-label="Novels checked" className={styles.number}>
          {run.novelsChecked.toLocaleString()}
        </td>
        <td data-label="New chapters" className={styles.number}>
          {run.newChaptersFound.toLocaleString()}
        </td>
      </tr>
      {failures.length > 0 && (
        <tr id={errorsId} hidden={!open} className={styles.errorsRow}>
          <td colSpan={5}>
            <ul className={styles.errors} aria-label="Novels whose check failed">
              {failures.map((failure) => (
                <li key={failure.novelId}>
                  <Link to={`/novels/${failure.novelId}`}>{failure.title}</Link>
                  <span>{failure.message}</span>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </tbody>
  );
}
