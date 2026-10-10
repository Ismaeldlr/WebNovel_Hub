import type { ThemePreference } from '@webnovel-hub/shared';
import { Monitor } from 'lucide-react';
import { ChoiceGroup, ChoiceLabel } from '../../components/ui';
import { THEME_OPTIONS } from './readerStyle';
import styles from './ThemePicker.module.css';

interface ThemePickerProps {
  value: ThemePreference;
  onChange: (theme: ThemePreference) => void;
}

/**
 * The theme of every page, the reader included, as swatches. The reading options
 * show it in the reader and in Settings; the top bar's quick menu offers the same list.
 */
export function ThemePicker({ value, onChange }: ThemePickerProps) {
  return (
    <ChoiceGroup
      legend="Theme"
      value={value}
      options={THEME_OPTIONS}
      onChange={onChange}
      layout="tiles"
      render={(option) => (
        <>
          <ThemeSwatch theme={option.value} />
          <ChoiceLabel>{option.label}</ChoiceLabel>
        </>
      )}
    />
  );
}

/** A theme's paper and ink (data-theme gives the swatch its tokens); Match device shows both. */
function ThemeSwatch({ theme }: { theme: ThemePreference }) {
  if (theme === 'system') {
    return (
      <span className={styles.system} aria-hidden="true">
        <span data-theme="light" />
        <span data-theme="dark" />
        <Monitor />
      </span>
    );
  }
  return (
    <span className={styles.swatch} data-theme={theme} aria-hidden="true">
      Aa
    </span>
  );
}
