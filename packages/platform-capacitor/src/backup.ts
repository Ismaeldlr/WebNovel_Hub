// Backups on Android: the core writes the copy into the app's cache, the share sheet saves
// it (to Files, Drive, another app), and the shell picks a backup and swaps it in
// (ShellPlugin.java). The library a restore replaces is kept in the app's files.
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Shell } from './background.js';

export const backups = {
  /** A path in the app's cache where a backup named `name` can be written. */
  async tempPath(name: string): Promise<string> {
    await Filesystem.deleteFile({ path: name, directory: Directory.Cache }).catch(() => undefined);
    const { uri } = await Filesystem.getUri({ path: name, directory: Directory.Cache });
    return decodeURIComponent(new URL(uri).pathname);
  },
  /** Offers the backup written at `path` through the share sheet; false when closed. */
  async save(path: string, name: string): Promise<boolean> {
    try {
      await Share.share({ title: name, files: [`file://${path}`] });
      return true;
    } catch (error) {
      if (/cancel/i.test(error instanceof Error ? error.message : String(error))) return false;
      throw error;
    }
  },
  /** Asks for a backup file; the path of the app's copy of it, or null when cancelled. */
  pick: async (): Promise<string | null> => (await Shell.pickBackup()).path ?? null,
  kept: async () => (await Shell.keptBackups()).backups,
  /** Puts the backup at `path` in place of the library, which is kept as `keepAs`. */
  replaceLibrary: (path: string, keepAs: string): Promise<void> =>
    Shell.replaceLibrary({ path, keepAs }),
};
