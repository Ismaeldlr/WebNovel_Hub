import { READER_PREFERENCE_LIMITS, type ReaderPreferences } from '@webnovel-hub/shared';
import { BellRing } from 'lucide-react';
import { Link } from 'react-router';
import { Card, ErrorState, Notice, Select, Spinner } from '../../components/ui';
import { plural } from '../../lib/format';
import { appKind } from '../../platform';
import { PageHeader } from '../pages/PageHeader';
import { ReaderOptions, SaveStatus } from '../preferences/ReaderOptions';
import { readerStyle } from '../preferences/readerStyle';
import {
  usePreferences,
  useShownPreferences,
  useUpdatePreferences,
} from '../preferences/usePreferences';
import { SectionHeading } from './SectionHeading';
import styles from './SettingsPage.module.css';
import { AppSection, BackgroundSection, NotifyChoice } from './AppSettings';
import { WtrLabSection } from './WtrLabSection';

/**
 * Settings: the look of every page and of the reader, how many
 * chapters to download ahead, and what goes on in the background. Changes apply and save
 * as they are made, like the reader's own options panel.
 */
export function SettingsPage() {
  const query = usePreferences();
  const { data: preferences } = query;

  return (
    <>
      <PageHeader
        title="Settings"
        lead="How the app and its chapters look, what is downloaded ahead of you, and what goes on in the background. Changes are saved as you make them."
        actions={preferences && <SaveStatus />}
      />
      {preferences ? (
        <SettingsSections preferences={preferences} />
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

function SettingsSections({ preferences: saved }: { preferences: ReaderPreferences }) {
  const [preferences, update] = useShownPreferences(saved, useUpdatePreferences());
  return (
    <div className={styles.sections}>
      <Card as="section" aria-labelledby="settings-appearance" className={styles.section}>
        <SectionHeading id="settings-appearance" title="Appearance">
          The theme of every page, the reader included, and how chapters look. You can also change
          these while reading, from the reading options.
        </SectionHeading>
        <div className={styles.reading}>
          <ReaderOptions
            preferences={preferences}
            onChange={update}
            showStatus={false}
            textSizes="both"
          />
          <Preview preferences={preferences} />
        </div>
      </Card>

      <Card as="section" aria-labelledby="settings-downloads" className={styles.section}>
        <SectionHeading id="settings-downloads" title="Downloads ahead">
          Chapters that aren't stored yet are downloaded when you open them. Downloading the next
          few in the background means they are ready when you get there.
        </SectionHeading>
        <div className={styles.field}>
          <Select
            label="Chapters to download ahead"
            hint="Also how many chapters are fetched when you open a novel you haven't started."
            value={String(preferences.prefetchCount)}
            options={PREFETCH_OPTIONS}
            onChange={(event) => update({ prefetchCount: Number(event.target.value) })}
          />
        </div>
      </Card>

      <Card as="section" aria-labelledby="settings-updates" className={styles.section}>
        <SectionHeading id="settings-updates" title="New chapters">
          Novels you are reading or following are checked for new chapters automatically, every few
          hours while the app is running. Any novel can also be checked straight away from its page.
        </SectionHeading>
        {appKind !== 'browser' && (
          <NotifyChoice
            enabled={preferences.notifyNewChapters}
            onChange={(notifyNewChapters) => update({ notifyNewChapters })}
          />
        )}
        <Notice variant="inline" icon={<BellRing aria-hidden="true" />}>
          Every check, and what it found, is listed in <Link to="/updates">Update Jobs</Link>.
        </Notice>
      </Card>

      <WtrLabSection preferences={preferences} onChange={update} />

      {appKind !== 'browser' && (
        <>
          <BackgroundSection kind={appKind} preferences={preferences} onChange={update} />
          <AppSection kind={appKind} />
        </>
      )}
    </div>
  );
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
