import { type ReactNode, useLayoutEffect, useMemo, useState } from 'react';
import { useMediaQuery } from '../lib/hooks';
import { DARK_QUERY, ThemeContext, initialPreference, resolveTheme } from './theme';

/**
 * Applies the theme to <html data-theme>, before the browser paints, and gives the
 * browser's own bars the page's colour. The theme itself comes from the reader's preferences
 * (ThemeFromPreferences); until they load, from this device's copy of them.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, showPreference] = useState(initialPreference);
  const prefersDark = useMediaQuery(DARK_QUERY);
  const theme = resolveTheme(preference, prefersDark);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    // The phone's status bar, and an installed app's title bar, take the page's paper.
    const paper = getComputedStyle(root).getPropertyValue('--paper').trim();
    if (paper) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', paper);
  }, [theme]);

  const value = useMemo(() => ({ preference, theme, showPreference }), [preference, theme]);
  return <ThemeContext value={value}>{children}</ThemeContext>;
}
