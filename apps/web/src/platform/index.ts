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
  /**
   * What the back button does: `handler` answers false when there's nothing to go back to
   * (the app then goes to the background). Returns a function that removes it.
   */
  onBackButton(handler: () => boolean): () => void;
}

/** A library replaced by a restore, kept on the device. */
export interface KeptBackup {
  name: string;
  path: string;
}

/** The shell's half of backups; the core writes and checks the library files. */
export interface BackupShell {
  /** A path in the app's own folder where a backup named `name` can be written. */
  tempPath(name: string): Promise<string>;
  /** Saves the backup written at `path` where the reader chooses; false when cancelled. */
  save(path: string, name: string): Promise<boolean>;
  /** Asks for a backup file; the path of the app's copy of it, or null when cancelled. */
  pick(): Promise<string | null>;
  /** The libraries replaced by a restore, newest first. */
  kept(): Promise<KeptBackup[]>;
  /**
   * Puts the backup at `path` in place of the library, which is kept as `keepAs`. The core
   * must be released first, and the page reloaded after.
   */
  replaceLibrary(path: string, keepAs: string): Promise<void>;
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
  backups?: BackupShell;
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
    backups: tauri.backups,
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
    backups: capacitor.backups,
    updates: {
      version: capacitor.appVersion,
      checkForUpdate: capacitor.checkForUpdate,
      installUpdate: capacitor.openLatestRelease,
    },
    android: {
      allowNotifications: capacitor.allowNotifications,
      batteryRestricted: capacitor.batteryRestricted,
      askBatteryExemption: capacitor.askBatteryExemption,
      onBackButton: capacitor.onBackButton,
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
