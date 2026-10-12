import { LIBRARY_STATUSES, type Profile } from '@webnovel-hub/shared';
import { useQuery } from '@tanstack/react-query';
import { Replace } from 'lucide-react';
import { Link } from 'react-router';
import { userApi } from '../../api/user';
import { queryKeys } from '../../app/queryClient';
import { Cover } from '../../components/Cover';
import { StatTiles } from '../../components/StatTiles';
import { ButtonLink, ErrorState, Spinner } from '../../components/ui';
import { plural, todayIn } from '../../lib/format';
import { STATUS_LABELS } from '../../lib/reading';
import { PageHeader } from '../pages/PageHeader';
import { ActivityHeatmap } from './ActivityHeatmap';
import { BarList } from './BarList';
import styles from './ProfilePage.module.css';

/** 12,345 → "12K", 1,234,567 → "1.2M"; smaller numbers in full. */
const compact = (value: number) =>
  value < 10_000
    ? value.toLocaleString()
    : new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(
        value,
      );

const days = (count: number) => plural(count, 'day');

/**
 * Profile: who you are, headline numbers and streaks, 90 days of
 * activity, the library by status and source, the novels read most, and the password.
 */
export function ProfilePage() {
  const profile = useQuery({
    queryKey: queryKeys.profile,
    queryFn: ({ signal }) => userApi.profile(signal),
  });

  return (
    <>
      <PageHeader
        title="Profile"
        lead="Your reading streaks and statistics."
        actions={
          <ButtonLink to="/profile/terms" icon={<Replace aria-hidden="true" />}>
            Terms
          </ButtonLink>
        }
      />
      <div className={styles.page}>
        {profile.isPending ? (
          <div className={styles.loading}>
            <Spinner size="lg" label="Loading your profile" />
          </div>
        ) : profile.isError ? (
          <ErrorState
            title="Your profile didn't load"
            message={profile.error.message}
            onRetry={() => void profile.refetch()}
            retrying={profile.isFetching}
          />
        ) : (
          <Statistics profile={profile.data} />
        )}
      </div>
    </>
  );
}

function Statistics({ profile }: { profile: Profile }) {
  const { totals, streaks, library, mostRead, longestNovel, timezone } = profile;
  const today = todayIn(timezone);
  return (
    <>
      <StatTiles
        label="Reading statistics"
        tiles={[
          { label: 'Chapters read', value: compact(totals.chaptersRead) },
          { label: 'Novels', value: compact(totals.novelsRead) },
          { label: 'Words read', value: compact(totals.wordsRead) },
          { label: 'Days read', value: compact(totals.readingDays) },
          {
            label: 'Current streak',
            value: days(streaks.current),
            note: `Longest: ${days(streaks.longest)}`,
          },
          {
            label: 'Per reading day',
            value:
              totals.readingDays === 0
                ? '0'
                : (totals.chaptersRead / totals.readingDays).toLocaleString(undefined, {
                    maximumFractionDigits: 1,
                  }),
            note: 'chapters, on average',
          },
        ]}
      />

      <section aria-labelledby="profile-activity" className={styles.section}>
        <h2 id="profile-activity" className={styles.sectionTitle}>
          Activity
        </h2>
        <p className={styles.sectionLead}>
          Chapters read each day, in your time zone ({timezone}).
        </p>
        <ActivityHeatmap activity={profile.activity} today={today} />
      </section>

      <div className={styles.columns}>
        <section aria-labelledby="profile-status" className={styles.section}>
          <h2 id="profile-status" className={styles.sectionTitle}>
            Library by status
          </h2>
          <p className={styles.sectionLead}>{plural(library.total, 'novel')} in your library.</p>
          <BarList
            unit={(value) => (value === 1 ? 'novel' : 'novels')}
            bars={LIBRARY_STATUSES.map((status) => ({
              key: status,
              label: STATUS_LABELS[status],
              value: library.byStatus[status],
            }))}
          />
        </section>

        <section aria-labelledby="profile-source" className={styles.section}>
          <h2 id="profile-source" className={styles.sectionTitle}>
            Library by source
          </h2>
          {library.bySource.length === 0 ? (
            <p className={styles.sectionLead}>Your library is empty.</p>
          ) : (
            <BarList
              unit={(value) => (value === 1 ? 'novel' : 'novels')}
              bars={library.bySource.map(({ source, count }) => ({
                key: source.key,
                label: source.name,
                value: count,
              }))}
            />
          )}
        </section>
      </div>

      <div className={styles.columns}>
        <section aria-labelledby="profile-most-read" className={styles.section}>
          <h2 id="profile-most-read" className={styles.sectionTitle}>
            Most read
          </h2>
          {mostRead.length === 0 ? (
            <p className={styles.sectionLead}>Novels you read will appear here.</p>
          ) : (
            <BarList
              unit={(value) => (value === 1 ? 'chapter read' : 'chapters read')}
              bars={mostRead.map(({ novel, chaptersRead }) => ({
                key: novel.id,
                label: <Link to={`/novels/${novel.id}`}>{novel.title}</Link>,
                value: chaptersRead,
              }))}
            />
          )}
        </section>

        <section aria-labelledby="profile-longest" className={styles.section}>
          <h2 id="profile-longest" className={styles.sectionTitle}>
            Longest novel
          </h2>
          {longestNovel === null ? (
            <p className={styles.sectionLead}>Nothing read yet.</p>
          ) : (
            <div className={styles.longest}>
              <Cover
                title={longestNovel.novel.title}
                author={longestNovel.novel.author}
                coverUrl={longestNovel.novel.coverUrl}
                size="sm"
              />
              <div>
                <p className={styles.longestTitle}>
                  <Link to={`/novels/${longestNovel.novel.id}`}>{longestNovel.novel.title}</Link>
                </p>
                <p className={styles.sectionLead}>
                  {plural(longestNovel.novel.totalChapters, 'chapter')}, of which you've read{' '}
                  {longestNovel.chaptersRead.toLocaleString()}.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
