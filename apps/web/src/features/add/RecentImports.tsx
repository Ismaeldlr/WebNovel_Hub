import { type IngestionJob, isJobFinished } from '@webnovel-hub/shared';
import { useQuery } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react';
import { Link } from 'react-router';
import { importsApi } from '../../api/catalog';
import { queryKeys } from '../../app/queryClient';
import { Badge } from '../../components/ui';
import { formatRelativeTime } from '../../lib/format';
import styles from './AddNovelsPage.module.css';

const LIMIT = 10;

function describe(job: IngestionJob) {
  if (job.status === 'completed') {
    return {
      icon: <CircleCheck aria-hidden="true" />,
      state: job.result?.duplicate ? 'Already in your library' : 'Imported',
      tone: 'ok' as const,
    };
  }
  if (job.status === 'failed') {
    return { icon: <CircleAlert aria-hidden="true" />, state: 'Failed', tone: 'danger' as const };
  }
  return {
    icon: <LoaderCircle aria-hidden="true" />,
    state: job.status === 'running' ? 'Importing' : 'Waiting',
    tone: 'warn' as const,
  };
}

/** The reader's recent URL imports. */
export function RecentImports() {
  const recent = useQuery({
    queryKey: queryKeys.recentImports,
    queryFn: ({ signal }) => importsApi.recent(LIMIT, signal),
    // Keep unfinished imports current.
    refetchInterval: (query) =>
      query.state.data?.some((job) => !isJobFinished(job.status)) ? 3_000 : false,
  });
  if (!recent.data || recent.data.length === 0) return null;

  return (
    <section className={styles.recent} aria-labelledby="recent-imports">
      <h2 id="recent-imports" className={styles.recentTitle}>
        Recent imports
      </h2>
      <ul className={styles.recentList}>
        {recent.data.map((job) => {
          const { icon, state, tone } = describe(job);
          const title = job.result?.title ?? job.url ?? 'Unknown address';
          return (
            <li key={job.id} className={styles.recentItem}>
              <span className={styles.recentIcon} data-tone={tone}>
                {icon}
              </span>
              <span className={styles.recentMain}>
                {job.status === 'completed' && job.result ? (
                  <Link to={`/novels/${job.result.novelId}`} className={styles.recentName}>
                    {title}
                  </Link>
                ) : (
                  <span className={styles.recentName}>{title}</span>
                )}
                <span className={styles.recentMeta}>
                  {state}
                  {job.status === 'failed' && job.error ? ` · ${job.error.message}` : ''}
                </span>
              </span>
              {job.source && <Badge>{job.source.name}</Badge>}
              <time className={styles.recentTime} dateTime={job.createdAt}>
                {formatRelativeTime(job.createdAt)}
              </time>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
