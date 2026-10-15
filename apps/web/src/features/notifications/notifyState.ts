import type { LibraryState, LibraryStatus, ReaderPreferences } from '@webnovel-hub/shared';
import { getPlatform } from '../../platform';

/** Whether the scheduled checks look at a novel with this status by themselves. */
export const checkedByStatus = (status: LibraryStatus) =>
  status === 'reading' || status === 'following';

/** Whether a novel's new chapters are announced when it hasn't chosen for itself. */
export const notifiedByDefault = (status: LibraryStatus, preferences: ReaderPreferences) =>
  preferences.notifyNovels === 'following' && checkedByStatus(status);

/** Whether the novel's new chapters are announced: its own choice, else the settings'. */
export const novelNotified = (library: LibraryState, preferences: ReaderPreferences) =>
  library.notify ?? notifiedByDefault(library.status, preferences);

/**
 * What to save for turning the novel's notifications on or off: no choice of its own
 * (null) when the settings already say so, so it follows them if they change.
 */
export const notifyChoice = (
  on: boolean,
  library: LibraryState,
  preferences: ReaderPreferences,
): boolean | null => (on === notifiedByDefault(library.status, preferences) ? null : on);

/**
 * Android 13+: asks to show notifications if the reader hasn't answered yet. Resolves to
 * false when they are off for the app, true elsewhere.
 */
export async function allowNotifications(): Promise<boolean> {
  const platform = await getPlatform();
  return (await platform.android?.allowNotifications()) ?? true;
}
