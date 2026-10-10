/// <reference types="@capacitor/background-runner" />
/// <reference types="@capacitor/local-notifications" />
/// <reference types="@capacitor/splash-screen" />
import type { CapacitorConfig } from '@capacitor/cli';

// During development the app can load the Vite dev server instead of the bundled build:
// CAP_DEV_URL=http://192.168.1.20:5173 npx cap run android
const devUrl = process.env.CAP_DEV_URL;

const config: CapacitorConfig = {
  appId: 'io.github.ismaeldlr.webnovelhub',
  appName: 'Webnovel Hub',
  webDir: '../web/dist',
  ...(devUrl ? { server: { url: devUrl, cleartext: true } } : {}),
  android: {
    // The page never asks for plain-HTTP pages; requests to sites go through the native client.
    allowMixedContent: false,
  },
  plugins: {
    CapacitorSQLite: { androidIsEncryption: false },
    // Short: the page shows its own loading state while the library opens.
    SplashScreen: { launchShowDuration: 300, showSpinner: false },
    LocalNotifications: { smallIcon: 'ic_stat_notify', iconColor: '#2c56c9' },
    // Checks followed novels for new chapters while the app is closed (runner/checks.ts).
    BackgroundRunner: {
      label: 'io.github.ismaeldlr.webnovelhub.checks',
      src: 'runner.js',
      event: 'checkForUpdates',
      repeat: true,
      interval: 30,
      autoStart: true,
    },
  },
};

export default config;
