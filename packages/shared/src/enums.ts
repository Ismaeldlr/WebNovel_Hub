/**
 * The app's enumerations, plus update-run triggers.
 * Source sites are not an enum: they are rows of `source_sites` (see ./sources.ts).
 */

export const LIBRARY_STATUSES = [
  'reading',
  'following',
  'on_hold',
  'dropped',
  'completed',
] as const;
export type LibraryStatus = (typeof LIBRARY_STATUSES)[number];

export const SCRAPE_ERROR_TYPES = [
  'network_error',
  'structure_changed',
  'rate_limited',
  'unknown',
] as const;
export type ScrapeErrorType = (typeof SCRAPE_ERROR_TYPES)[number];

export const JOB_STATUSES = ['pending', 'running', 'completed', 'failed'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_TYPES = [
  'novel_ingestion',
  'chapter_fetch',
  'update_check',
  'manual_update_check',
  'novel_fetch_all',
] as const;
export type JobType = (typeof JOB_TYPES)[number];

/**
 * The theme a user chose for the whole app, the reader included: a palette, or
 * `system` to follow the device's light or dark setting. In the order of the reader_theme
 * enum's values.
 */
export const THEME_PREFERENCES = ['light', 'dark', 'sepia', 'system', 'black'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** The palettes a page can show: every preference but `system`, which resolves to one. */
export type Theme = Exclude<ThemePreference, 'system'>;

export const CONTENT_WIDTHS = ['narrow', 'medium', 'wide'] as const;
export type ContentWidth = (typeof CONTENT_WIDTHS)[number];

/** What started an update run: the scheduler or a user. */
export const UPDATE_RUN_TRIGGERS = ['scheduled', 'manual'] as const;
export type UpdateRunTrigger = (typeof UPDATE_RUN_TRIGGERS)[number];
