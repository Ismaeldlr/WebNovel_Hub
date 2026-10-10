import type { PreferencesUpdate, ReaderPreferences } from '@webnovel-hub/shared';
import type { Queryable } from '../db/database.js';
import { findPreferences, updatePreferences } from '../repositories/preferences.js';

export interface PreferencesService {
  get(): Promise<ReaderPreferences>;
  /** Saves the given preferences and returns all of them. */
  update(changes: PreferencesUpdate): Promise<ReaderPreferences>;
}

export function createPreferencesService(db: Queryable): PreferencesService {
  return {
    get: () => findPreferences(db),
    update: (changes) => updatePreferences(db, changes),
  };
}
