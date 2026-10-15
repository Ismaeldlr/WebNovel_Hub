// The Android parts around the page: notifications, the share sheet, the system bars, the
// back button and updates from the project's releases.
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { CapacitorHttp, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Share } from '@capacitor/share';
import { type Notice, type NoticeKind, noticeNumber } from '@webnovel-hub/core';
import { toBase64 } from './http.js';

const RELEASES = 'https://github.com/Ismaeldlr/WebNovel_Hub/releases';
const LATEST_RELEASE = 'https://api.github.com/repos/Ismaeldlr/WebNovel_Hub/releases/latest';

/**
 * Each kind of notice has a category of its own in Android's settings for the app, where
 * the reader can change its sound or turn it off. New chapters alert; the rest are quiet.
 */
const CHANNELS: Record<
  Exclude<NoticeKind, 'test'>,
  { name: string; about: string; importance: 2 | 3 }
> = {
  'new-chapters': {
    name: 'New chapters',
    about: 'Chapters found by the automatic checks',
    importance: 3,
  },
  downloads: {
    name: 'Downloads finished',
    about: 'A whole novel downloaded, or a novel added',
    importance: 2,
  },
  problems: {
    name: 'Problems',
    about: "Checks and downloads that couldn't be done",
    importance: 2,
  },
};

let channels: Promise<unknown> | null = null;

/**
 * A system notification, shown only while the app is out of sight (a test one always).
 * Tapping one about a novel opens it (see onNotificationTap).
 */
export const notify = (notice: Notice): void => {
  void (async () => {
    if (notice.kind !== 'test' && (await App.getState()).isActive) return;
    channels ??= Promise.all(
      Object.entries(CHANNELS).map(([id, channel]) =>
        LocalNotifications.createChannel({
          id,
          name: channel.name,
          description: channel.about,
          importance: channel.importance,
        }),
      ),
    );
    await channels;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: noticeNumber(notice),
          title: notice.title,
          body: notice.body,
          largeBody: notice.body,
          channelId: notice.kind === 'test' ? 'new-chapters' : notice.kind,
          smallIcon: 'ic_stat_notify',
          autoCancel: true,
          ...(notice.novelId ? { extra: { novelId: notice.novelId } } : {}),
        },
      ],
    });
  })().catch((error: unknown) => console.warn('could not show a notification', error));
};

/**
 * Calls `open` with the novel of each notification the reader taps. Returns a function
 * that stops it.
 */
export function onNotificationTap(open: (novelId: string) => void): () => void {
  const listener = LocalNotifications.addListener(
    'localNotificationActionPerformed',
    ({ notification }) => {
      const novelId = (notification.extra as { novelId?: unknown } | undefined)?.novelId;
      if (typeof novelId === 'string') open(novelId);
    },
  );
  return () => void listener.then((handle) => handle.remove());
}

/**
 * Whether the app may show notifications, without asking: `prompt` until the reader has
 * answered Android's question (Android 13+).
 */
export async function notificationPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  const { display } = await LocalNotifications.checkPermissions();
  return display === 'granted' || display === 'denied' ? display : 'prompt';
}

/** Whether the app may show notifications, asking the reader the first time (Android 13+). */
export async function allowNotifications(): Promise<boolean> {
  const { display } = await LocalNotifications.checkPermissions();
  if (display === 'granted') return true;
  if (display === 'denied') return false;
  return (await LocalNotifications.requestPermissions()).display === 'granted';
}

/**
 * Offers the file through the share sheet, so it can go to Files, an e-reader app or a
 * message. Resolves to false when the reader closes the sheet.
 */
export async function saveFile(file: Blob, fileName: string): Promise<boolean> {
  const { uri } = await Filesystem.writeFile({
    path: fileName,
    data: toBase64(new Uint8Array(await file.arrayBuffer())),
    directory: Directory.Cache,
  });
  try {
    await Share.share({ title: fileName, files: [uri] });
    return true;
  } catch (error) {
    if (/cancel/i.test(error instanceof Error ? error.message : String(error))) return false;
    throw error;
  }
}

export const appVersion = async (): Promise<string> => (await App.getInfo()).version;

/** Whether version `a` is newer than `b` (both like 1.2.3). */
export function isNewer(a: string, b: string): boolean {
  const parts = (version: string) => version.split(/[.-]/).map((part) => Number(part) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
}

/** The latest release's version when it is newer than this app, else null. */
export async function checkForUpdate(): Promise<string | null> {
  const response = await CapacitorHttp.get({
    url: LATEST_RELEASE,
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (response.status === 404) return null; // nothing released yet
  if (response.status !== 200) throw new Error(`GitHub answered with status ${response.status}`);
  const data = (typeof response.data === 'string' ? JSON.parse(response.data) : response.data) as {
    tag_name?: string;
  };
  const latest = String(data.tag_name ?? '').replace(/^v/, '');
  return latest && isNewer(latest, await appVersion()) ? latest : null;
}

/** Opens the latest release, where the reader downloads the new APK. */
export async function openLatestRelease(): Promise<void> {
  await Browser.open({ url: `${RELEASES}/latest` });
}

/** Status bar and navigation bar icons that stay readable on the page's theme. */
function followTheme(): void {
  const apply = () => {
    const theme = document.documentElement.dataset.theme;
    const dark = theme === 'dark' || theme === 'black';
    void SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light });
  };
  apply();
  new MutationObserver(apply).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
}

let backHandler: (() => boolean) | null = null;

/**
 * What the back button does: `handler` closes something or goes up a page, and answers
 * false when there is nothing left to go back to. Returns a function that removes it.
 */
export function onBackButton(handler: () => boolean): () => void {
  backHandler = handler;
  return () => {
    if (backHandler === handler) backHandler = null;
  };
}

/**
 * The back button does what the page says (else it goes back a page); with nothing left
 * to go back to, it sends the app to the background rather than closing it, so background
 * fetching can go on.
 */
function handleBackButton(): void {
  void App.addListener('backButton', ({ canGoBack }) => {
    const handled = backHandler ? backHandler() : canGoBack && (window.history.back(), true);
    if (!handled) void App.minimizeApp();
  });
}

export function setUpShell(): void {
  followTheme();
  handleBackButton();
}
