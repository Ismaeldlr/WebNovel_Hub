import { READER_PREFERENCE_LIMITS, type ReaderPreferences } from '@webnovel-hub/shared';
import { BellRing, ChevronRight } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router';
import { Card, ErrorState, Notice, Select, Spinner } from '../../components/ui';
import { COMPACT_QUERY } from '../../lib/breakpoints';
import { plural } from '../../lib/format';
import { useMediaQuery, usePageBar } from '../../lib/hooks';
import { appKind } from '../../platform';
import { PageHeader } from '../pages/PageHeader';
import { ReaderOptions, SaveStatus } from '../preferences/ReaderOptions';
import { FONT_OPTIONS, THEME_OPTIONS, readerStyle } from '../preferences/readerStyle';
import {
  usePreferences,
  useShownPreferences,
  useUpdatePreferences,
} from '../preferences/usePreferences';
import { SectionHeading } from './SectionHeading';
import styles from './SettingsPage.module.css';
import { AppSection, BackgroundSection, NotifyChoice } from './AppSettings';
import { BackupSection } from './BackupSection';
import { WtrLabSection } from './WtrLabSection';
import { SETTINGS_GROUPS, type SettingsGroup, settingsPath, useAppVersion } from './settingsGroups';
import { useWtrLabAccount } from './wtrLabAccount';

/**
 * Settings, in groups by what they do. Phones: the groups as a list, each showing its
 * current value, and a page per group. Larger screens: the list beside the open group
 * (Appearance first). Changes apply and save as they are made.
 */
export function SettingsPage() {
  const { group } = useParams();
  const phone = useMediaQuery(COMPACT_QUERY);
  const query = usePreferences();
  const { data: preferences } = query;
  const groups = SETTINGS_GROUPS.filter((each) => !each.appOnly || appKind !== 'browser');
  const current = groups.find((each) => each.id === group);
  usePageBar({ back: phone && current ? '/settings' : false });

  if (group !== undefined && !current) return <Navigate to="/settings" replace />;
  const shown = current ?? (phone ? undefined : groups[0]);

  return (
    <>
      <PageHeader
        title={phone && current ? current.title : 'Settings'}
        lead="Changes are saved as you make them."
        actions={!phone && preferences && <SaveStatus />}
      />
      {preferences ? (
        <div className={styles.layout}>
          {!(phone && current) && (
            <SettingsNav groups={groups} current={shown?.id} preferences={preferences} />
          )}
          {shown && (
            <div className={styles.pane}>
              <GroupContent group={shown} preferences={preferences} phone={phone} />
            </div>
          )}
          {phone && !current && (
            <p className={styles.saved}>
              <SaveStatus />
            </p>
          )}
        </div>
      ) : query.isError ? (
        <ErrorState
          title="Your settings didn't load"
          message={query.error.message}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <div className={styles.loading}>
          <Spinner size="lg" label="Loading your settings" />
        </div>
      )}
    </>
  );
}

/** The groups as links, each with its current value, in two lists. */
function SettingsNav({
  groups,
  current,
  preferences,
}: {
  groups: SettingsGroup[];
  current: string | undefined;
  preferences: ReaderPreferences;
}) {
  const sets = [
    { id: 'reading', label: 'Reading' },
    { id: 'app', label: 'App' },
  ] as const;
  return (
    <nav aria-label="Settings" className={styles.nav}>
      {sets.map((set) => (
        <div key={set.id} className={styles.set}>
          <h2 className={styles.setLabel}>{set.label}</h2>
          <ul className={styles.groups}>
            {groups
              .filter((each) => each.set === set.id)
              .map(({ id, title, icon: Icon }) => (
                <li key={id}>
                  <Link
                    to={settingsPath(id)}
                    className={styles.row}
                    aria-current={id === current ? 'page' : undefined}
                  >
                    <span className={styles.tile} aria-hidden="true">
                      <Icon />
                    </span>
                    <span className={styles.rowText}>
                      <span className={styles.rowTitle}>{title}</span>
                      <span className={styles.rowValue}>
                        <GroupValue id={id} preferences={preferences} />
                      </span>
                    </span>
                    <ChevronRight className={styles.chevron} aria-hidden="true" />
                  </Link>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** What a group is set to, in a few words, e.g. "Match device · Serif · 16 px". */
function GroupValue({
  id,
  preferences,
}: {
  id: SettingsGroup['id'];
  preferences: ReaderPreferences;
}) {
  const phone = useMediaQuery(COMPACT_QUERY);
  const account = useWtrLabAccount(id === 'accounts' && appKind !== 'browser');
  const version = useAppVersion(id === 'about');
  switch (id) {
    case 'appearance': {
      const theme = THEME_OPTIONS.find((option) => option.value === preferences.theme)?.label;
      const font = FONT_OPTIONS.find((option) => option.value === preferences.fontFamily)?.label;
      const size = phone ? preferences.fontSizeCompact : preferences.fontSize;
      return [theme, font, `${size} px`].filter(Boolean).join(' · ');
    }
    case 'downloads': {
      const ahead = preferences.prefetchCount;
      const downloads = ahead === 0 ? 'No chapters ahead' : `${plural(ahead, 'chapter')} ahead`;
      if (appKind === 'browser') return downloads;
      return `${downloads} · Notifications ${preferences.notifyNewChapters ? 'on' : 'off'}`;
    }
    case 'accounts': {
      const signedIn = account.data?.signedIn;
      if (signedIn === true) return 'WTR Lab · Signed in';
      if (signedIn === false) return 'WTR Lab · Not signed in';
      return 'WTR Lab';
    }
    case 'backup':
      return 'Save your library to a file, or restore one';
    case 'about':
      return version.data ? `Version ${version.data}` : 'Version and updates';
  }
}

/** One group's settings. */
function GroupContent({
  group,
  preferences: saved,
  phone,
}: {
  group: SettingsGroup;
  preferences: ReaderPreferences;
  phone: boolean;
}) {
  const [preferences, update] = useShownPreferences(saved, useUpdatePreferences());
  if (appKind === 'browser' && group.appOnly) return null;
  switch (group.id) {
    case 'appearance':
      return (
        <Card as="section" aria-labelledby="settings-appearance" className={styles.section}>
          <SectionHeading id="settings-appearance" title="Appearance" hideOnPhone />
          <div className={styles.reading}>
            <ReaderOptions
              preferences={preferences}
              onChange={update}
              showStatus={phone}
              textSizes="both"
            />
            <Preview preferences={preferences} />
          </div>
        </Card>
      );
    case 'downloads':
      return (
        <>
          <Card as="section" aria-labelledby="settings-downloads" className={styles.section}>
            <SectionHeading id="settings-downloads" title="Downloads ahead" />
            <div className={styles.field}>
              <Select
                label="Chapters to download ahead"
                hint="Also how many are fetched when you open a novel you haven't started."
                value={String(preferences.prefetchCount)}
                options={PREFETCH_OPTIONS}
                onChange={(event) => update({ prefetchCount: Number(event.target.value) })}
              />
            </div>
          </Card>
          <Card as="section" aria-labelledby="settings-updates" className={styles.section}>
            <SectionHeading id="settings-updates" title="New chapters">
              Novels you&apos;re reading or following are checked every few hours.
            </SectionHeading>
            {appKind !== 'browser' && (
              <NotifyChoice
                enabled={preferences.notifyNewChapters}
                onChange={(notifyNewChapters) => update({ notifyNewChapters })}
              />
            )}
            <Notice variant="inline" icon={<BellRing aria-hidden="true" />}>
              Every check is listed in <Link to="/updates">Update Jobs</Link>.
            </Notice>
          </Card>
          {appKind !== 'browser' && (
            <BackgroundSection kind={appKind} preferences={preferences} onChange={update} />
          )}
        </>
      );
    case 'accounts':
      return <WtrLabSection preferences={preferences} onChange={update} />;
    case 'backup':
      return appKind === 'browser' ? null : <BackupSection kind={appKind} />;
    case 'about':
      return appKind === 'browser' ? null : <AppSection kind={appKind} />;
  }
}

const { min: PREFETCH_MIN, max: PREFETCH_MAX } = READER_PREFERENCE_LIMITS.prefetchCount;

const PREFETCH_OPTIONS = Array.from({ length: PREFETCH_MAX - PREFETCH_MIN + 1 }, (_, index) => {
  const count = PREFETCH_MIN + index;
  return {
    value: String(count),
    label: count === 0 ? 'None: download each chapter when I open it' : plural(count, 'chapter'),
  };
});

// Original text, written for this preview.
const SAMPLE = [
  'The lamps in the reading room had burned low by the time Mara reached the last shelf. She drew out the slim green volume, blew the dust from its spine, and opened it to the page her grandmother had marked with a ribbon forty years before.',
  '“Start here,” said the note in the margin, in ink gone brown with age. So she did.',
];

/** The chosen look on a few lines of text, at this screen's text size. */
function Preview({ preferences }: { preferences: ReaderPreferences }) {
  return (
    <figure className={styles.preview} aria-labelledby="settings-preview">
      <figcaption id="settings-preview" className={styles.previewCaption}>
        Preview
      </figcaption>
      <div className={styles.previewPage} style={readerStyle(preferences)}>
        {SAMPLE.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </figure>
  );
}
