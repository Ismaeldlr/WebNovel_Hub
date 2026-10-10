import type { Core, HttpClient, Notice, PageRenderer, SqlDriver } from '@webnovel-hub/core';
import { devBridgeDriver, devBridgeHttp } from './devBridge';

/** The app's version, and its updates from the project's releases. */
export interface AppUpdates {
  version(): Promise<string>;
  /** The newer release's version, or null when this one is the latest. */
  checkForUpdate(): Promise<string | null>;
  /** Windows: installs the newer release and restarts into it. Android: opens its download. */
  installUpdate(): Promise<void>;
}

/** What only the Android app asks the system for. */
export interface AndroidShell {
  /** Whether notifications may show, asking the reader the first time (Android 13+). */
  allowNotifications(): Promise<boolean>;
  /** Whether Android may hold the app back in the background to save battery. */
  batteryRestricted(): Promise<boolean>;
  /** Opens Android's prompt to let the app run in the background without battery limits. */
  askBatteryExemption(): Promise<void>;
}

/** What the app runs on: the Windows app, the Android app, or a browser with the bridge. */
export interface AppPlatform {
  driver: SqlDriver;
  http: HttpClient;
  renderer?: PageRenderer;
  /**
   * Opens a site's page (its sign-in page) in a window of the app, which shares its cookies
   * with the rendered pages. Android resolves once the reader closes it, Windows at once.
   */
  openSiteWindow?: (url: string, title: string) => Promise<void>;
  notify?: (notice: Notice) => void;
  /** Saves a file where the reader chooses; false when the reader cancels. */
  saveFile?: (file: Blob, fileName: string) => Promise<boolean>;
  updates?: AppUpdates;
  android?: AndroidShell;
  /** Runs once the core is open (Android: background fetching watches the queue). */
  onCoreReady?: (core: Core) => void;
}

/** Whether the page runs inside the Windows app (Tauri's window). */
export const inWindowsApp = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Whether the page runs inside the Android app (Capacitor's WebView, which sets this first). */
export const inAndroidApp =
  typeof window !== 'undefined' &&
  (window as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.() ===
    'android';

/** Which app the page runs in: `browser` is development, with the bridge. */
export type AppKind = 'windows' | 'android' | 'browser';
export const appKind: AppKind = inWindowsApp ? 'windows' : inAndroidApp ? 'android' : 'browser';

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL ?? 'http://127.0.0.1:5174';

async function windowsPlatform(): Promise<AppPlatform> {
  const tauri = await import('@webnovel-hub/platform-tauri');
  return {
    driver: tauri.tauriDriver(),
    http: tauri.tauriHttp(),
    renderer: tauri.tauriRenderer(),
    openSiteWindow: tauri.openSiteWindow,
    notify: tauri.notify,
    saveFile: tauri.saveFile,
    updates: {
      version: tauri.appVersion,
      checkForUpdate: tauri.checkForUpdate,
      installUpdate: tauri.installUpdate,
    },
  };
}

async function androidPlatform(): Promise<AppPlatform> {
  const capacitor = await import('@webnovel-hub/platform-capacitor');
  capacitor.setUpShell();
  return {
    driver: await capacitor.capacitorDriver(),
    http: capacitor.capacitorHttp(),
    renderer: capacitor.capacitorRenderer(),
    openSiteWindow: capacitor.openSiteWindow,
    notify: capacitor.notify,
    saveFile: capacitor.saveFile,
    updates: {
      version: capacitor.appVersion,
      checkForUpdate: capacitor.checkForUpdate,
      installUpdate: capacitor.openLatestRelease,
    },
    android: {
      allowNotifications: capacitor.allowNotifications,
      batteryRestricted: capacitor.batteryRestricted,
      askBatteryExemption: capacitor.askBatteryExemption,
    },
    onCoreReady: (core) => void capacitor.manageBackground(core),
  };
}

let loaded: Promise<AppPlatform> | null = null;

/** The platform, loaded once: only the code for the one in use is fetched. */
export function getPlatform(): Promise<AppPlatform> {
  loaded ??=
    appKind === 'windows'
      ? windowsPlatform()
      : appKind === 'android'
        ? androidPlatform()
        : Promise.resolve({ driver: devBridgeDriver(BRIDGE_URL), http: devBridgeHttp(BRIDGE_URL) });
  return loaded;
}
