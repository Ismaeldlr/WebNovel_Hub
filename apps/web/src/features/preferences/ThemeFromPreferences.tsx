import { useLayoutEffect } from 'react';
import { useTheme } from '../../app/theme';
import { usePreferences } from './usePreferences';

/**
 * Shows the reader's theme on every page: the saved one, as it loads and whenever it
 * changes.
 */
export function ThemeFromPreferences() {
  const theme = usePreferences().data?.theme;
  const { showPreference } = useTheme();
  useLayoutEffect(() => {
    if (theme) showPreference(theme);
  }, [theme, showPreference]);
  return null;
}
