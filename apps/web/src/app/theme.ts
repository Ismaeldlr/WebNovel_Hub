import type { Theme, ThemePreference } from '@webnovel-hub/shared';
import { createContext, useContext } from 'react';
import { mirroredTheme } from '../features/preferences/store';

/**
 * One theme for every page, the reader included. It is one of the reader's preferences;
 * until those load it comes from this device's copy of them, which index.html also
 * paints before the first frame.
 */

export const DARK_QUERY = '(prefers-color-scheme: dark)';

/** The theme to start from: this device's copy of the preferences, else the device's. */
export function initialPreference(): ThemePreference {
  return mirroredTheme() ?? 'system';
}

/** The palette a preference shows: `system` follows the device's light or dark setting. */
export function resolveTheme(preference: ThemePreference, prefersDark: boolean): Theme {
  if (preference !== 'system') return preference;
  return prefersDark ? 'dark' : 'light';
}

export interface ThemeContextValue {
  /** The chosen theme, `system` included. */
  preference: ThemePreference;
  /** The palette on screen. */
  theme: Theme;
  /**
   * Shows `preference`. Only for ThemeFromPreferences, which passes on the saved one: to
   * change the theme, save it with useUpdatePreferences, so every page gets it.
   */
  showPreference: (preference: ThemePreference) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
