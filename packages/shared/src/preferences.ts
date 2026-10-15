import type { ContentWidth, ThemePreference } from './enums.js';

/**
 * Reader font choices. The UI maps each key to a font stack, so fonts can change
 * without a migration. Mirrors the CHECK constraint on reader_preferences.font_family.
 */
export const READER_FONT_FAMILIES = ['serif', 'sans', 'hyperlegible', 'system'] as const;
export type ReaderFontFamily = (typeof READER_FONT_FAMILIES)[number];

/**
 * Whose new chapters are announced: every novel being read or followed, or only the novels
 * the reader picked. A novel's own choice (LibraryState.notify) comes first either way.
 */
export const NOTIFY_NOVELS = ['following', 'picked'] as const;
export type NotifyNovels = (typeof NOTIFY_NOVELS)[number];

/** A user's preferences (the reader_preferences table). */
export interface ReaderPreferences {
  /** The theme of every page, the reader included. */
  theme: ThemePreference;
  /** The reading text size on tablets and computers, in pixels. */
  fontSize: number;
  /** The reading text size on phones (under 600 px wide), in pixels. */
  fontSizeCompact: number;
  lineSpacing: number;
  contentWidth: ContentWidth;
  fontFamily: ReaderFontFamily;
  /** Chapters fetched ahead in the background. */
  prefetchCount: number;
  updateIntervalHours: number;
  /** Whether fetching goes on after the app's window is closed (in the tray on Windows). */
  backgroundFetching: boolean;
  /** Whether whole novels download only on Wi-Fi, not on mobile data (Android). */
  wifiOnly: boolean;
  /** Whether new chapters found by the scheduled checks are announced. */
  notifyNewChapters: boolean;
  /** Which novels' new chapters are announced, unless a novel chose for itself. */
  notifyNovels: NotifyNovels;
  /** One notification per novel with new chapters, rather than one for all of them. */
  notifyEachNovel: boolean;
  /** Whether notifications name the novels (off: only counts, for the lock screen). */
  notifyShowTitles: boolean;
  /** Whether a finished whole-novel download or a novel added from a site is announced. */
  notifyDownloads: boolean;
  /** Whether a check or download that failed is announced. */
  notifyProblems: boolean;
  /**
   * Whether WTR Lab chapters whose AI translation needs an account are fetched in its
   * machine translation instead, while the app isn't signed in there.
   */
  wtrLabMachineTranslation: boolean;
}

/** The reader_preferences column defaults. */
export const READER_PREFERENCE_DEFAULTS: Readonly<ReaderPreferences> = {
  theme: 'system',
  fontSize: 18,
  fontSizeCompact: 16,
  lineSpacing: 1.6,
  contentWidth: 'medium',
  fontFamily: 'serif',
  prefetchCount: 3,
  updateIntervalHours: 6,
  backgroundFetching: false,
  wifiOnly: false,
  notifyNewChapters: true,
  notifyNovels: 'following',
  notifyEachNovel: false,
  notifyShowTitles: true,
  notifyDownloads: true,
  notifyProblems: true,
  wtrLabMachineTranslation: false,
};

/** Allowed ranges, enforced by CHECK constraints on reader_preferences. */
export const READER_PREFERENCE_LIMITS = {
  fontSize: { min: 14, max: 28, step: 1 },
  fontSizeCompact: { min: 14, max: 28, step: 1 },
  lineSpacing: { min: 1.4, max: 2.2, step: 0.1 },
  prefetchCount: { min: 0, max: 10, step: 1 },
  updateIntervalHours: { min: 1, max: 168, step: 1 },
} as const;

/**
 * The preferences a user can change (PATCH /user/preferences). `updateIntervalHours`
 * isn't one: novels are checked for new chapters on the server's schedule.
 */
export const EDITABLE_PREFERENCES = [
  'theme',
  'fontSize',
  'fontSizeCompact',
  'lineSpacing',
  'contentWidth',
  'fontFamily',
  'prefetchCount',
  'backgroundFetching',
  'wifiOnly',
  'notifyNewChapters',
  'notifyNovels',
  'notifyEachNovel',
  'notifyShowTitles',
  'notifyDownloads',
  'notifyProblems',
  'wtrLabMachineTranslation',
] as const;
export type EditablePreference = (typeof EDITABLE_PREFERENCES)[number];

/** Body of PATCH /user/preferences: the preferences to change, at least one. */
export type PreferencesUpdate = Partial<Pick<ReaderPreferences, EditablePreference>>;

/** Response of GET and PATCH /user/preferences: every preference, as saved. */
export interface PreferencesResponse {
  preferences: ReaderPreferences;
}
