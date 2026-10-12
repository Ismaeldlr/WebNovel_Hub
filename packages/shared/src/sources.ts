/**
 * Source sites are data, not an enum: each is a row of the `source_sites`
 * table, published by the scraper for every adapter it has. Adding a site therefore
 * needs no change here; read names, hosts and importability from the database.
 */

/** A `source_sites.key`, also stored in `novels.source`, e.g. `'royal_road'`. */
export type SourceKey = string;

/** The source of novels imported from EPUB files; never importable by URL. */
export const EPUB_SOURCE: SourceKey = 'epub';

/** Mirrors the `source_sites_key_format` CHECK constraint; the schema tests compare them. */
export const SOURCE_KEY_PATTERN = /^[a-z][a-z0-9_]{1,31}$/;

/** A source as other resources name it: its key and display name. */
export interface SourceRef {
  key: SourceKey;
  name: string;
}

/** One `source_sites` row as the API returns it. */
export interface SourceSite {
  key: SourceKey;
  /** Display name for badges, filters and messages, e.g. "Royal Road". */
  name: string;
  homeUrl: string | null;
  /** Lower-case host names whose URLs can be imported from this source. */
  hosts: string[];
  /** False for EPUB and for sources the scraper no longer supports. */
  importable: boolean;
  /** Supported, but not working reliably yet: listed apart on Add Novels. */
  inProgress: boolean;
}

/**
 * Response of GET /sources/:key/account and POST /sources/:key/account/link, for
 * sites that show some chapters only to signed-in readers (WTR Lab).
 */
export interface SourceAccountResponse {
  /** The site's sign-in page, opened in a window of the app. */
  signInUrl: string;
  /** Whether the app is signed in there; null when this device can't tell. */
  signedIn: boolean | null;
}

/** Response of GET /sources: importable sources first, then by name. */
export interface SourcesResponse {
  sources: SourceSite[];
}
