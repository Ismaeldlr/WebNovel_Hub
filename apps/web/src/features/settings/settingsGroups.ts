import { useQuery } from '@tanstack/react-query';
import {
  Archive,
  Bell,
  CircleUserRound,
  Download,
  HardDrive,
  Info,
  type LucideIcon,
  Palette,
} from 'lucide-react';
import { appKind, getPlatform } from '../../platform';

export type SettingsGroupId =
  'appearance' | 'downloads' | 'notifications' | 'storage' | 'accounts' | 'backup' | 'about';

export interface SettingsGroup {
  id: SettingsGroupId;
  title: string;
  icon: LucideIcon;
  /** Which list it is in on the overview. */
  set: 'reading' | 'app';
  /** Only in the Windows and Android apps. */
  appOnly?: boolean;
}

/** Settings, grouped by what they do; each group is a page of its own on phones. */
export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  { id: 'appearance', title: 'Appearance', icon: Palette, set: 'reading' },
  { id: 'downloads', title: 'Downloads & updates', icon: Download, set: 'reading' },
  { id: 'notifications', title: 'Notifications', icon: Bell, set: 'reading' },
  { id: 'storage', title: 'Storage', icon: HardDrive, set: 'app' },
  { id: 'accounts', title: 'Accounts', icon: CircleUserRound, set: 'app' },
  { id: 'backup', title: 'Backup & restore', icon: Archive, set: 'app', appOnly: true },
  { id: 'about', title: 'About', icon: Info, set: 'app', appOnly: true },
];

export const settingsPath = (group: SettingsGroupId) => `/settings/${group}`;

/** The app's version (the Windows and Android apps only). */
export function useAppVersion(enabled = true) {
  return useQuery({
    queryKey: ['app-version'],
    queryFn: async () => (await getPlatform()).updates?.version() ?? null,
    staleTime: Infinity,
    enabled: enabled && appKind !== 'browser',
  });
}
