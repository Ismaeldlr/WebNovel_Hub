import type { ReaderPreferences } from '@webnovel-hub/shared';
import { ALargeSmall, Settings, X } from 'lucide-react';
import { type FocusEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { IconButton } from '../../components/ui';
import { useDismiss } from '../../lib/hooks';
import { ReaderOptions } from '../preferences/ReaderOptions';
import { useUpdatePreferences } from '../preferences/usePreferences';
import styles from './ReaderOptionsPanel.module.css';

/** Matches the open panel, whose controls keep the arrow keys: they don't turn the page. */
export const READER_OPTIONS_SELECTOR = '[data-reader-options]';

/**
 * The options panel inside the reader: a button in the reader's bar
 * opens a non-modal dialog beside the text, so each change shows on the chapter at once.
 * Escape, the close button, a click outside or moving focus out of it closes it.
 */
export function ReaderOptionsPanel({
  preferences,
}: {
  preferences: ReaderPreferences | undefined;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const update = useUpdatePreferences();

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  useDismiss(open, [rootRef], (reason) => close(reason === 'escape'));

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (open && next instanceof Node && !rootRef.current?.contains(next)) close(false);
  };

  return (
    <div ref={rootRef} className={styles.root} onBlur={onBlur}>
      <IconButton
        ref={buttonRef}
        label="Reading options"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        disabled={!preferences}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <ALargeSmall aria-hidden="true" />
      </IconButton>
      {open && preferences && (
        <div
          ref={panelRef}
          id={`${id}-panel`}
          role="dialog"
          aria-labelledby={`${id}-title`}
          tabIndex={-1}
          className={styles.panel}
          data-reader-options=""
        >
          <div className={styles.head}>
            <h2 id={`${id}-title`} className={styles.title}>
              Reading options
            </h2>
            <IconButton size="sm" label="Close reading options" onClick={() => close()}>
              <X aria-hidden="true" />
            </IconButton>
          </div>
          <ReaderOptions preferences={preferences} onChange={update} />
          <p className={styles.more}>
            <Settings aria-hidden="true" />
            <span>
              Downloads ahead and more are in <Link to="/settings">Settings</Link>.
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
