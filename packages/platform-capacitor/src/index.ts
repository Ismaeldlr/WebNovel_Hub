// What the Android app gives the core and the page: SQLite through the community SQLite
// plugin, HTTP through Capacitor's native client, and the shell's own plugins
// (apps/mobile/android: Shell, Render).
export { askBatteryExemption, batteryRestricted, manageBackground } from './background.js';
export { backups } from './backup.js';
export { capacitorHttp, capacitorRenderer, openSiteWindow } from './http.js';
export {
  allowNotifications,
  appVersion,
  checkForUpdate,
  isNewer,
  notificationPermission,
  notify,
  onBackButton,
  onNotificationTap,
  openLatestRelease,
  saveFile,
  setUpShell,
} from './shell.js';
export { capacitorDriver } from './sqlite.js';
