import {
  type ContentWidth,
  type ReaderFontFamily,
  type ReaderPreferences,
  type ReaderTextAlign,
  type ThemePreference,
} from '@webnovel-hub/shared';
import type { CSSProperties } from 'react';
// The one reader font the app shell doesn't already load. Loaded with the reader and the
// Settings page; the browser downloads it only when a reader picks it.
import '@fontsource-variable/source-sans-3/wght.css';

/** The reading column's widest line for each width. */
const MEASURES: Record<ContentWidth, string> = {
  narrow: '34rem',
  medium: '40rem',
  wide: '50rem',
};

/** Each font key's stack (the keys are stored, so the fonts can change freely). */
export const FONT_STACKS: Record<ReaderFontFamily, string> = {
  serif: 'var(--font-serif)',
  sans: "'Source Sans 3 Variable', 'Segoe UI', system-ui, sans-serif",
  hyperlegible: 'var(--font-ui)',
  system: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
};

/**
 * The reader's typography as CSS custom properties: set on the reading column,
 * so a change restyles the text at once, without re-rendering it. ReadingText.module.css
 * uses them, with the phone size under 600 px.
 */
export function readerStyle(preferences: ReaderPreferences): CSSProperties {
  return {
    '--reader-font-size': `${preferences.fontSize / 16}rem`,
    '--reader-font-size-compact': `${preferences.fontSizeCompact / 16}rem`,
    '--reader-line-height': String(preferences.lineSpacing),
    '--reader-measure': MEASURES[preferences.contentWidth],
    '--reader-font': FONT_STACKS[preferences.fontFamily],
    '--reader-paragraph-spacing': `${preferences.paragraphSpacing}em`,
    '--reader-text-align': preferences.textAlign,
    '--reader-indent': preferences.paragraphIndent ? '1.5em' : '0',
  } as CSSProperties;
}

interface Option<T extends string> {
  value: T;
  label: string;
}

/** The themes: the one list every theme control offers. */
export const THEME_OPTIONS: Option<ThemePreference>[] = [
  { value: 'system', label: 'Match device' },
  { value: 'light', label: 'Light' },
  { value: 'sepia', label: 'Sepia' },
  { value: 'dark', label: 'Dark' },
  { value: 'black', label: 'Black' },
];

export const WIDTH_OPTIONS: Option<ContentWidth>[] = [
  { value: 'narrow', label: 'Narrow' },
  { value: 'medium', label: 'Medium' },
  { value: 'wide', label: 'Wide' },
];

export const ALIGN_OPTIONS: Option<ReaderTextAlign>[] = [
  { value: 'start', label: 'Left' },
  { value: 'justify', label: 'Justified' },
];

export const FONT_OPTIONS: (Option<ReaderFontFamily> & { detail: string })[] = [
  { value: 'serif', label: 'Serif', detail: 'Newsreader' },
  { value: 'sans', label: 'Sans serif', detail: 'Source Sans' },
  { value: 'hyperlegible', label: 'Hyperlegible', detail: 'Atkinson Hyperlegible' },
  { value: 'system', label: 'Device font', detail: "This device's own" },
];
