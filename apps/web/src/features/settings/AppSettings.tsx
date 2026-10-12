import { useMutation, useQuery } from '@tanstack/react-query';
import type { PreferencesUpdate, ReaderPreferences } from '@webnovel-hub/shared';
import { BatteryWarning, BellOff, Download, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, ChoiceGroup, ChoiceLabel, Notice } from '../../components/ui';
import { type AppKind, getPlatform } from '../../platform';
import { SectionHeading } from './SectionHeading';
import { useAppVersion } from './settingsGroups';
import styles from './SettingsPage.module.css';

type Kind = Exclude<AppKind, 'browser'>;

interface Choice<T extends string> {
  value: T;
  label: string;
  detail: string;
}

/** Radios with a line of detail under each choice. */
export function Choices<T extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: T;
  options: readonly Choice<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <ChoiceGroup
      legend={legend}
      value={value}
      options={options}
      onChange={onChange}
      layout="list"
      render={(option, detailId) => (
        <>
          <ChoiceLabel>{option.label}</ChoiceLabel>
          <span id={detailId} className={styles.choiceDetail} aria-hidden="true">
            {option.detail}
          </span>
        </>
      )}
    />
  );
}

const BACKGROUND = {
  windows: {
    lead: 'Fetching can go on after you close the window; Quit in the notification area stops it.',
    legend: 'When I close the window',
    options: [
      { value: 'quit', label: 'Quit the app', detail: 'Fetching stops until you open it again.' },
      {
        value: 'keep',
        label: 'Keep fetching in the background',
        detail: 'The app stays in the notification area and tells you about new chapters.',
      },
    ],
  },
  android: {
    lead: 'Downloads can go on after you leave the app, with a notification while they run.',
    legend: 'When I leave the app',
    options: [
      {
        value: 'quit',
        label: 'Pause downloads',
        detail: 'They carry on when you come back to the app.',
      },
      {
        value: 'keep',
        label: 'Keep downloading in the background',
        detail: 'Until the downloads are done. Closing the app from the recent apps stops them.',
      },
    ],
  },
} as const;

const NETWORK_OPTIONS = [
  {
    value: 'any',
    label: 'On Wi-Fi or mobile data',
    detail: 'Whole novels download wherever you are.',
  },
  {
    value: 'wifi',
    label: 'Only on Wi-Fi',
    detail: 'Chapters you open and novels you add still download on mobile data.',
  },
] as const;

/**
 * What happens to downloads when the app is out of sight: closing the window (Windows) or
 * leaving the app (Android). On Android, also whole-novel downloads on mobile data.
 */
export function BackgroundSection({
  kind,
  preferences,
  onChange,
}: {
  kind: Kind;
  preferences: ReaderPreferences;
  onChange: (update: PreferencesUpdate) => void;
}) {
  const text = BACKGROUND[kind];
  const [notificationsOff, setNotificationsOff] = useState(false);
  const battery = useQuery({
    queryKey: ['battery-restricted'],
    queryFn: async () => (await getPlatform()).android?.batteryRestricted() ?? false,
    enabled: kind === 'android' && preferences.backgroundFetching,
    // Android's prompt leaves the page in view, so no focus event says it was answered.
    refetchInterval: (query) => (query.state.data ? 2_000 : false),
  });

  const chooseBackground = (keep: boolean) => {
    onChange({ backgroundFetching: keep });
    if (keep && kind === 'android') {
      void getPlatform()
        .then((platform) => platform.android?.allowNotifications())
        .then((allowed) => setNotificationsOff(allowed === false));
    }
  };

  return (
    <Card as="section" aria-labelledby="settings-background" className={styles.section}>
      <SectionHeading id="settings-background" title="Background fetching">
        {text.lead}
      </SectionHeading>
      <Choices
        legend={text.legend}
        value={preferences.backgroundFetching ? 'keep' : 'quit'}
        options={text.options}
        onChange={(value) => chooseBackground(value === 'keep')}
      />
      {kind === 'android' && preferences.backgroundFetching && battery.data && (
        <Notice tone="warn" as="div" icon={<BatteryWarning aria-hidden="true" />}>
          <p>
            Android may pause the app to save battery, which stops downloads soon after the screen
            turns off. Letting the app run in the background keeps them going.
          </p>
          <div className={styles.actions}>
            <Button
              onClick={() =>
                void getPlatform().then((platform) => platform.android?.askBatteryExemption())
              }
            >
              Allow background use
            </Button>
          </div>
        </Notice>
      )}
      {notificationsOff && (
        <Notice tone="warn" icon={<BellOff aria-hidden="true" />}>
          Notifications are off for Webnovel Hub, so you won&apos;t see downloads going on or new
          chapters. You can turn them on in Android&apos;s settings for the app.
        </Notice>
      )}
      {kind === 'android' && (
        <Choices
          legend="Download whole novels"
          value={preferences.wifiOnly ? 'wifi' : 'any'}
          options={NETWORK_OPTIONS}
          onChange={(value) => onChange({ wifiOnly: value === 'wifi' })}
        />
      )}
    </Card>
  );
}

const NOTIFY_OPTIONS = [
  {
    value: 'on',
    label: 'Tell me with a notification',
    detail: 'When the app is out of sight.',
  },
  { value: 'off', label: "Don't notify me", detail: 'New chapters show in your library.' },
] as const;

/** Whether new chapters found by the scheduled checks are announced. */
export function NotifyChoice({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <Choices
      legend="When the checks find new chapters"
      value={enabled ? 'on' : 'off'}
      options={NOTIFY_OPTIONS}
      onChange={(value) => onChange(value === 'on')}
    />
  );
}

/** The app's version, and its updates from the project's releases. */
export function AppSection({ kind }: { kind: Kind }) {
  const version = useAppVersion();
  const check = useMutation({
    mutationFn: async () => (await getPlatform()).updates?.checkForUpdate() ?? null,
  });
  const install = useMutation({
    mutationFn: async () => (await getPlatform()).updates?.installUpdate(),
  });
  const available = check.data;

  return (
    <Card as="section" aria-labelledby="settings-app" className={styles.section}>
      <SectionHeading id="settings-app" title="Version">
        {kind === 'android'
          ? 'New versions download in your browser; installing one keeps your library.'
          : 'Updating keeps your library as it is.'}
      </SectionHeading>
      {version.data && <p className={styles.version}>Webnovel Hub {version.data}</p>}
      <div className={styles.actions}>
        {available ? (
          <Button
            variant="primary"
            icon={<Download aria-hidden="true" />}
            busy={install.isPending}
            onClick={() => install.mutate()}
          >
            {kind === 'android'
              ? `Download version ${available}`
              : `Install version ${available} and restart`}
          </Button>
        ) : (
          <Button
            icon={<RefreshCw aria-hidden="true" />}
            busy={check.isPending}
            onClick={() => check.mutate()}
          >
            Check for updates
          </Button>
        )}
        {check.isSuccess && !available && <span role="status">This is the latest version.</span>}
      </div>
      {(check.isError || install.isError) && (
        <Notice variant="inline" tone="danger">
          {check.isError ? "Couldn't check for updates" : "Couldn't install the update"}:{' '}
          {(check.error ?? install.error)?.message}
        </Notice>
      )}
    </Card>
  );
}
