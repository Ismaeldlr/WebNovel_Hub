import {
  type PreferencesUpdate,
  READER_PREFERENCE_DEFAULTS,
  READER_PREFERENCE_LIMITS,
  type ReaderPreferences,
} from '@webnovel-hub/shared';
import {
  AArrowDown,
  AArrowUp,
  AlignJustify,
  AlignLeft,
  CircleAlert,
  CloudCheck,
  Minus,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { Button, ChoiceGroup, ChoiceLabel, Slider, Spinner, Switch } from '../../components/ui';
import { COMPACT_QUERY } from '../../lib/breakpoints';
import { useMediaQuery } from '../../lib/hooks';
import styles from './ReaderOptions.module.css';
import { ALIGN_OPTIONS, FONT_OPTIONS, FONT_STACKS, WIDTH_OPTIONS } from './readerStyle';
import { type SaveStatus as Status } from './store';
import { ThemePicker } from './ThemePicker';
import { useSaveStatus, useShownPreferences } from './usePreferences';

/** The reading text's look, which "Reset to defaults" puts back (with the theme, unless only
 * the text options show). */
const TEXT_LOOK = [
  'fontSize',
  'fontSizeCompact',
  'lineSpacing',
  'paragraphSpacing',
  'contentWidth',
  'textAlign',
  'paragraphIndent',
  'fontFamily',
] as const;

interface ReaderOptionsProps {
  preferences: ReaderPreferences;
  onChange: (changes: PreferencesUpdate) => void;
  /** Shows where saving stands under the options (a page may show it elsewhere). */
  showStatus?: boolean;
  /**
   * The text sizes to offer: the one for this screen (in the reader), or both the phone
   * and the larger-screen size (in Settings).
   */
  textSizes?: 'screen' | 'both';
  /** Which options show: all of them, only the theme, or only the reading text's. */
  part?: 'all' | 'theme' | 'text';
}

/**
 * The look of the app and the reader: the theme of every page
 *, then the reading text's size, line spacing, width and font. Used by the reader's
 * options panel and the Settings page. Every control is a native radio group or slider, so
 * keyboards and screen readers work as they expect.
 */
export function ReaderOptions({
  preferences: saved,
  onChange: save,
  showStatus = true,
  textSizes = 'screen',
  part = 'all',
}: ReaderOptionsProps) {
  const [preferences, onChange] = useShownPreferences(saved, save);
  const phone = useMediaQuery(COMPACT_QUERY);
  const { fontSize, fontSizeCompact, lineSpacing, paragraphSpacing } = READER_PREFERENCE_LIMITS;
  const look: readonly (keyof ReaderPreferences)[] =
    part === 'text' ? TEXT_LOOK : ['theme', ...TEXT_LOOK];
  const isDefault = look.every((key) => preferences[key] === READER_PREFERENCE_DEFAULTS[key]);
  const sizes = textSizes === 'both' ? [false, true] : [phone];
  const theme = <ThemePicker value={preferences.theme} onChange={(theme) => onChange({ theme })} />;
  if (part === 'theme') return <div className={styles.options}>{theme}</div>;

  return (
    <div className={styles.options}>
      {part === 'all' && theme}

      {sizes.map((forPhones) => (
        <Slider
          key={forPhones ? 'phones' : 'larger'}
          label={forPhones ? 'Text size on phones' : 'Text size on larger screens'}
          value={forPhones ? preferences.fontSizeCompact : preferences.fontSize}
          limits={forPhones ? fontSizeCompact : fontSize}
          shown={(value) => `${value} px`}
          spoken={(value) => `${value} pixels`}
          decrease={{ label: 'Smaller text', icon: <AArrowDown aria-hidden="true" /> }}
          increase={{ label: 'Larger text', icon: <AArrowUp aria-hidden="true" /> }}
          onChange={(value) =>
            onChange(forPhones ? { fontSizeCompact: value } : { fontSize: value })
          }
        />
      ))}

      <Slider
        label="Line spacing"
        value={preferences.lineSpacing}
        limits={lineSpacing}
        shown={(value) => value.toFixed(1)}
        spoken={(value) => value.toFixed(1)}
        decrease={{ label: 'Less line spacing', icon: <Minus aria-hidden="true" /> }}
        increase={{ label: 'More line spacing', icon: <Plus aria-hidden="true" /> }}
        onChange={(value) => onChange({ lineSpacing: value })}
      />

      <Slider
        label="Paragraph spacing"
        value={preferences.paragraphSpacing}
        limits={paragraphSpacing}
        shown={(value) => value.toFixed(1)}
        spoken={(value) => value.toFixed(1)}
        decrease={{ label: 'Less paragraph spacing', icon: <Minus aria-hidden="true" /> }}
        increase={{ label: 'More paragraph spacing', icon: <Plus aria-hidden="true" /> }}
        onChange={(value) => onChange({ paragraphSpacing: value })}
      />

      {!(textSizes === 'screen' && phone) && (
        <ChoiceGroup
          legend="Width"
          value={preferences.contentWidth}
          options={WIDTH_OPTIONS}
          onChange={(contentWidth) => onChange({ contentWidth })}
          layout="tiles"
          render={(option) => (
            <>
              <span className={styles.measure} data-width={option.value} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <ChoiceLabel>{option.label}</ChoiceLabel>
            </>
          )}
        />
      )}

      <ChoiceGroup
        legend="Alignment"
        value={preferences.textAlign}
        options={ALIGN_OPTIONS}
        onChange={(textAlign) => onChange({ textAlign })}
        layout="tiles"
        render={(option) => (
          <>
            {option.value === 'justify' ? (
              <AlignJustify className={styles.alignIcon} aria-hidden="true" />
            ) : (
              <AlignLeft className={styles.alignIcon} aria-hidden="true" />
            )}
            <ChoiceLabel>{option.label}</ChoiceLabel>
          </>
        )}
      />

      <Switch
        label="Indent paragraphs"
        detail="The first line of each paragraph starts further in."
        checked={preferences.paragraphIndent}
        onChange={(paragraphIndent) => onChange({ paragraphIndent })}
      />

      <ChoiceGroup
        legend="Font"
        value={preferences.fontFamily}
        options={FONT_OPTIONS}
        onChange={(fontFamily) => onChange({ fontFamily })}
        layout="list"
        phone="chips"
        render={(option, detailId) => (
          <>
            <ChoiceLabel
              className={styles.fontName}
              style={{ fontFamily: FONT_STACKS[option.value] }}
            >
              {option.label}
            </ChoiceLabel>
            <span id={detailId} className={styles.fontDetail} aria-hidden="true">
              {option.detail}
            </span>
          </>
        )}
      />

      <div className={styles.footer}>
        <Button
          size="sm"
          variant="ghost"
          icon={<RotateCcw aria-hidden="true" />}
          disabled={isDefault}
          onClick={() =>
            onChange(Object.fromEntries(look.map((key) => [key, READER_PREFERENCE_DEFAULTS[key]])))
          }
        >
          Reset to defaults
        </Button>
        {showStatus && <SaveStatus />}
      </div>
    </div>
  );
}

const STATUS_TEXT: Record<Status, string> = {
  idle: 'Saved on this device.',
  saving: 'Saving…',
  saved: 'Saved.',
  failed: 'Not saved.',
};

/** Where the background save stands, read out politely as it changes. */
export function SaveStatus() {
  const status = useSaveStatus();
  return (
    <p role="status" className={styles.status} data-status={status}>
      {status === 'saving' ? (
        <Spinner size="sm" decorative />
      ) : status === 'failed' ? (
        <CircleAlert aria-hidden="true" />
      ) : (
        <CloudCheck aria-hidden="true" />
      )}
      <span>{STATUS_TEXT[status]}</span>
    </p>
  );
}
