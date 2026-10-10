// What the Android app gives the core and the page: SQLite through the community SQLite
// plugin, HTTP through Capacitor's native client, and the shell's own plugins
// (apps/mobile/android: Shell, Render).
export { askBatteryExemption, batteryRestricted, manageBackground } from './background.js';
export { capacitorHttp, capacitorRenderer, openSiteWindow } from './http.js';
export {
  allowNotifications,
  appVersion,
  checkForUpdate,
  isNewer,
  notify,
  openLatestRelease,
  saveFile,
  setUpShell,
} from './shell.js';
export { capacitorDriver } from './sqlite.js';
