import { useMutation, useQuery } from '@tanstack/react-query';
import type { PreferencesUpdate, ReaderPreferences } from '@webnovel-hub/shared';
import { BellOff, BellRing, Info, Send, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { libraryApi } from '../../api/catalog';
import { queryKeys } from '../../app/queryClient';
import { Button, Card, IconButton, Notice, Switch } from '../../components/ui';
import { appKind, getPlatform } from '../../platform';
import { useSetNotify } from '../library/libraryActions';
import { allowNotifications } from '../notifications/notifyState';
import { Choices } from './AppSettings';
import { SectionHeading } from './SectionHeading';
import styles from './SettingsPage.module.css';

/** When notifications show, as each app can. */
const WHEN = {
  windows:
    'They show while the window is closed or behind others. With the window closed, the app must stay in the notification area: see Background fetching in Downloads & updates.',
  android: 'They show while you are out of the app, also while it is closed.',
  browser: 'This browser shows no notifications; the Windows and Android apps do, as set here.',
} as const;

const NOVELS_OPTIONS = [
  {
    value: 'following',
    label: "Every novel I'm reading or following",
    detail: "Turn off Notify on a novel's page to leave it out.",
  },
  {
    value: 'picked',
    label: 'Only the novels I pick',
    detail: "Turn on Notify on a novel's page to pick it.",
  },
] as const;

/**
 * What the reader is told with a notification: each kind on or off, whose new chapters
 * (every novel read or followed, or only picked ones, besides each novel's own choice),
 * one notification per novel or one for all, and whether titles show. In the apps, a test
 * notification, and Android's permission when it is missing.
 */
export function NotificationSettings({
  preferences,
  onChange,
}: {
  preferences: ReaderPreferences;
  onChange: (update: PreferencesUpdate) => void;
}) {
  const grouping = [
    {
      value: 'together',
      label: 'One for all novels',
      detail: '"12 new chapters in 3 novels: …"',
    },
    {
      value: 'each',
      label: 'One for each novel',
      detail: preferences.notifyShowTitles
        ? `A novel's newest replaces its last one${appKind === 'android' ? '; tap it to open the novel' : ''}.`
        : 'With titles hidden, they come as one.',
    },
  ] as const;

  return (
    <>
      {appKind === 'android' && <AndroidPermission />}
      <Card as="section" aria-labelledby="settings-notify-kinds" className={styles.section}>
        <SectionHeading id="settings-notify-kinds" title="Tell me about">
          {WHEN[appKind]}
        </SectionHeading>
        <div>
          <Switch
            label="New chapters"
            detail="Found by the checks every few hours."
            checked={preferences.notifyNewChapters}
            onChange={(notifyNewChapters) => onChange({ notifyNewChapters })}
          />
          <Switch
            label="Finished downloads"
            detail="A whole novel is downloaded, or a novel you added is ready."
            checked={preferences.notifyDownloads}
            onChange={(notifyDownloads) => onChange({ notifyDownloads })}
          />
          <Switch
            label="Problems"
            detail="A novel can't be checked any more, or a download stopped."
            checked={preferences.notifyProblems}
            onChange={(notifyProblems) => onChange({ notifyProblems })}
          />
        </div>
      </Card>

      {preferences.notifyNewChapters && (
        <Card as="section" aria-labelledby="settings-notify-novels" className={styles.section}>
          <SectionHeading id="settings-notify-novels" title="New chapters">
            Which novels you hear about, and how.
          </SectionHeading>
          <Choices
            legend="Which novels"
            value={preferences.notifyNovels}
            options={NOVELS_OPTIONS}
            onChange={(notifyNovels) => onChange({ notifyNovels })}
          />
          <NovelChoices picked={preferences.notifyNovels === 'picked'} />
          <Choices
            legend="Notifications"
            value={preferences.notifyEachNovel ? 'each' : 'together'}
            options={grouping}
            onChange={(value) => onChange({ notifyEachNovel: value === 'each' })}
          />
        </Card>
      )}

      <Card as="section" aria-labelledby="settings-notify-privacy" className={styles.section}>
        <SectionHeading id="settings-notify-privacy" title="Privacy" />
        <Switch
          label="Show novel titles"
          detail="Off: notifications only count chapters and novels, say on a lock screen others see."
          checked={preferences.notifyShowTitles}
          onChange={(notifyShowTitles) => onChange({ notifyShowTitles })}
        />
      </Card>

      {appKind !== 'browser' && <TestNotification />}
    </>
  );
}

/**
 * The novels that chose for themselves on their page (the Notify button), each with a way
 * back to the setting above.
 */
function NovelChoices({ picked }: { picked: boolean }) {
  const choices = useQuery({
    queryKey: queryKeys.notifyChoices,
    queryFn: ({ signal }) => libraryApi.notifyChoices(signal),
  });
  const setNotify = useSetNotify();
  if (!choices.data) return null;
  if (choices.data.length === 0) {
    return (
      <p className={styles.choiceDetail}>
        {picked
          ? "No novels picked yet: turn on Notify on a novel's page."
          : "No novel has its own choice. Notify on a novel's page leaves it out, or adds one you aren't reading or following."}
      </p>
    );
  }
  return (
    <div className={styles.kept}>
      <h3 className={styles.keptTitle}>Novels with their own choice</h3>
      <ul className={styles.keptList}>
        {choices.data.map(({ novelId, title, notify }) => (
          <li key={novelId}>
            <span className={styles.notifyNovel}>
              {notify ? (
                <BellRing aria-hidden="true" className={styles.notifyOn} />
              ) : (
                <BellOff aria-hidden="true" />
              )}
              <Link to={`/novels/${encodeURIComponent(novelId)}`}>{title}</Link>
              <span className={styles.choiceDetail}>{notify ? 'Always' : 'Never'}</span>
            </span>
            <IconButton
              size="sm"
              label={`${title}: follow the setting above`}
              title="Follow the setting above"
              onClick={() =>
                setNotify.mutate({
                  novelId,
                  notify: null,
                  told: { title: `${title} follows the setting above again` },
                })
              }
            >
              <X aria-hidden="true" />
            </IconButton>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Android 13+ asks before an app shows notifications: the question when it wasn't asked
 * yet, and where to turn them back on when the reader said no.
 */
function AndroidPermission() {
  const permission = useQuery({
    queryKey: ['notification-permission'],
    queryFn: async () => (await getPlatform()).android?.notificationPermission() ?? 'granted',
  });
  const ask = useMutation({
    mutationFn: allowNotifications,
    onSettled: () => permission.refetch(),
  });
  if (permission.data === 'denied') {
    return (
      <Notice tone="warn" icon={<BellOff aria-hidden="true" />}>
        Notifications are off for Webnovel Hub, so none show. Turn them on in Android&apos;s
        settings: Apps, Webnovel Hub, Notifications.
      </Notice>
    );
  }
  if (permission.data !== 'prompt') return null;
  return (
    <Notice as="div" icon={<Info aria-hidden="true" />}>
      <p>Android asks you before the app can show notifications.</p>
      <div className={styles.actions}>
        <Button busy={ask.isPending} onClick={() => ask.mutate()}>
          Allow notifications
        </Button>
      </div>
    </Notice>
  );
}

/** Sends one now, while the app is in view, to see how notifications look and sound. */
function TestNotification() {
  const [sent, setSent] = useState<'sent' | 'off' | null>(null);
  const send = async () => {
    if (!(await allowNotifications())) {
      setSent('off');
      return;
    }
    (await getPlatform()).notify?.({
      kind: 'test',
      title: 'Webnovel Hub',
      body: 'Notifications work: this is how new chapters will show.',
    });
    setSent('sent');
  };
  return (
    <Card as="section" aria-labelledby="settings-notify-test" className={styles.section}>
      <SectionHeading id="settings-notify-test" title="Try it">
        {appKind === 'android'
          ? "Each kind is also a category in Android's settings for the app, where you can change its sound."
          : 'Windows holds notifications back while Do not disturb is on.'}
      </SectionHeading>
      <div className={styles.actions}>
        <Button icon={<Send aria-hidden="true" />} onClick={() => void send()}>
          Send a test notification
        </Button>
        {sent && (
          <span role="status">
            {sent === 'off'
              ? "Notifications are off for Webnovel Hub in Android's settings."
              : appKind === 'android'
                ? "Sent. Nothing showed? Check Android's notification settings for the app."
                : 'Sent. Nothing showed? Check Settings, System, Notifications in Windows.'}
          </span>
        )}
      </div>
    </Card>
  );
}
