// Background fetching on Android. A backgrounded app keeps running its page but loses the
// network, unless a foreground service runs; and Chromium freezes a hidden page after about
// five minutes, unless the WebView reports itself visible. So:
//
// - while the reader allows background fetching and the queue has work, a foreground
//   service shows "Fetching chapters" with a Stop button, and the WebView stays "visible";
//   the service can only start while the app is on screen, so it starts as soon as there
//   is work, and stops once the queue is empty;
// - the job runner pauses whenever the app is out of sight without the service, so jobs
//   wait in the queue instead of failing for want of a network;
// - with "Wi-Fi only", whole-novel downloads wait while the phone is on mobile data;
// - the runner that checks for new chapters while the app is closed is kept up to date with
//   the novels to check, and hands back what it found when the app returns.
import { App } from '@capacitor/app';
import { registerPlugin } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';
import type { Core, QueueStatus } from '@webnovel-hub/core';
import type { ReaderPreferences } from '@webnovel-hub/shared';
import { checkListKeeper, collectInbox } from './closed.js';

interface ShellPlugin {
  setKeepVisible(options: { on: boolean }): Promise<void>;
  batteryRestricted(): Promise<{ restricted: boolean }>;
  askBatteryExemption(): Promise<void>;
  pickBackup(): Promise<{ path?: string }>;
  keptBackups(): Promise<{ backups: { name: string; path: string }[] }>;
  replaceLibrary(options: { path: string; keepAs: string }): Promise<void>;
}

/** The app's own plugin (apps/mobile: ShellPlugin.java). */
export const Shell = registerPlugin<ShellPlugin>('Shell');

const NOTIFICATION = 1;
const CHANNEL = 'fetching';
const STOP = 1;
/** Android's `FOREGROUND_SERVICE_TYPE_DATA_SYNC`; the plugin's enum doesn't list it. */
const DATA_SYNC = 1;
/** How often the queue and the settings are looked at. */
const TICK_MS = 5_000;
/** How often the runner's list of novels is compared with the library. */
const LIST_MS = 60_000;

function describe(status: QueueStatus): string {
  if (status.message) return status.message;
  const jobs = status.running + status.waiting;
  return `${jobs} download${jobs === 1 ? '' : 's'} to go`;
}

async function preferences(core: Core): Promise<ReaderPreferences | null> {
  const response = await core.dispatch({ method: 'GET', path: '/user/preferences' });
  if (!('body' in response) || !response.body.success) return null;
  return (response.body.data as { preferences: ReaderPreferences }).preferences;
}

/** Starts watching the queue, the app's state and the network; runs for the app's life. */
export async function manageBackground(core: Core): Promise<void> {
  const runner = core.runner;
  if (!runner) return;

  let onScreen = (await App.getState()).isActive;
  let metered = (await Network.getStatus()).connectionType === 'cellular';
  let service: string | null = null; // the notification's text while the service runs
  let stopped = false; // the reader pressed Stop; cleared when the app comes back
  let busy = false;
  const leaveCheckList = checkListKeeper(core);
  let listLeftAt = 0;
  const withRunner = (work: () => Promise<void>) =>
    work().catch((error: unknown) => console.warn('background runner:', error));

  await ForegroundService.createNotificationChannel({
    id: CHANNEL,
    name: 'Fetching chapters',
    description: 'Shown while chapters download in the background',
    importance: 2,
  });

  const startService = async (body: string) => {
    await ForegroundService.startForegroundService({
      id: NOTIFICATION,
      title: 'Fetching chapters',
      body,
      smallIcon: 'ic_stat_notify',
      notificationChannelId: CHANNEL,
      buttons: [{ id: STOP, title: 'Stop' }],
      serviceType: DATA_SYNC as never,
      silent: true,
    });
    await Shell.setKeepVisible({ on: true });
    service = body;
  };

  const stopService = async () => {
    service = null;
    await Shell.setKeepVisible({ on: false });
    await ForegroundService.stopForegroundService();
  };

  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const settings = await preferences(core);
      const status = await core.queueStatus();
      const wanted =
        Boolean(settings?.backgroundFetching) && !stopped && status.running + status.waiting > 0;
      const body = describe(status);
      if (wanted && service === null && onScreen) await startService(body);
      else if (wanted && service !== null && service !== body) {
        await ForegroundService.updateForegroundService({
          id: NOTIFICATION,
          title: 'Fetching chapters',
          body,
          smallIcon: 'ic_stat_notify',
          notificationChannelId: CHANNEL,
          buttons: [{ id: STOP, title: 'Stop' }],
          silent: true,
        });
        service = body;
      } else if (!wanted && service !== null) await stopService();

      if (onScreen || service !== null) runner.resume();
      else await runner.pause();
      await runner.holdWholeNovels(Boolean(settings?.wifiOnly) && metered);
      if (onScreen && Date.now() - listLeftAt >= LIST_MS) {
        listLeftAt = Date.now();
        await withRunner(leaveCheckList);
      }
    } catch (error) {
      console.warn('could not update background fetching', error);
    } finally {
      busy = false;
    }
  };

  await App.addListener('appStateChange', ({ isActive }) => {
    onScreen = isActive;
    if (isActive) stopped = false;
    void tick();
    if (isActive) void withRunner(() => collectInbox(core));
  });
  await Network.addListener('networkStatusChange', ({ connectionType }) => {
    metered = connectionType === 'cellular';
    void tick();
  });
  await ForegroundService.addListener('buttonClicked', ({ buttonId }) => {
    if (buttonId !== STOP) return;
    stopped = true;
    void tick();
  });
  setInterval(() => void tick(), TICK_MS);
  await withRunner(() => collectInbox(core));
  await tick();
}

/** Whether Android may hold the app back in the background to save battery. */
export const batteryRestricted = async (): Promise<boolean> =>
  (await Shell.batteryRestricted()).restricted;

/** Opens Android's prompt to let the app run in the background without battery limits. */
export const askBatteryExemption = (): Promise<void> => Shell.askBatteryExemption();
