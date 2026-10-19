import type { ReaderPreferences } from '@webnovel-hub/shared';
import { ALargeSmall, Settings, SlidersHorizontal, X } from 'lucide-react';
import {
  type FocusEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { IconButton, type TabItem, tabPanelProps, Tabs } from '../../components/ui';
import { COMPACT_QUERY } from '../../lib/breakpoints';
import { useDismiss, useMediaQuery } from '../../lib/hooks';
import { ReaderOptions } from '../preferences/ReaderOptions';
import { useUpdatePreferences } from '../preferences/usePreferences';
import styles from './ReaderOptionsPanel.module.css';

/** Matches the open panel, whose controls keep the arrow keys: they don't turn the page. */
export const READER_OPTIONS_SELECTOR = '[data-reader-options]';

type SheetTab = 'chapter' | 'text' | 'theme';

const SHEET_TABS: TabItem<SheetTab>[] = [
  { id: 'chapter', label: 'Chapter' },
  { id: 'text', label: 'Text' },
  { id: 'theme', label: 'Theme' },
];

/**
 * The options panel inside the reader: a button in the reader's bar
 * opens a non-modal dialog beside the text, so each change shows on the chapter at once.
 * Escape, the close button, a click outside or moving focus out of it closes it.
 *
 * On phones it is the reader's menu instead, a sheet along the bottom with three tabs: the
 * chapter (where it is, and what to do with it), the text's options, and the theme.
 */
export function ReaderOptionsPanel({
  preferences,
  chapter,
}: {
  preferences: ReaderPreferences | undefined;
  /** Phones: the Chapter tab. Any of its buttons or links closes the menu as it acts. */
  chapter?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<SheetTab>('chapter');
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const update = useUpdatePreferences();
  // Phones: the sheet goes to the end of the page, over the toolbar its button sits in.
  const sheet = useMediaQuery(COMPACT_QUERY);
  const menu = sheet && chapter !== undefined;
  const name = menu ? 'Reader menu' : 'Reading options';

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  useDismiss(open, [rootRef, panelRef], (reason) => close(reason === 'escape'));

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    const inside = rootRef.current?.contains(next) || panelRef.current?.contains(next);
    if (open && next instanceof Node && !inside) close(false);
  };

  const panel = preferences && (
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
        <h2 id={`${id}-title`} className={menu ? 'visually-hidden' : styles.title}>
          {name}
        </h2>
        {menu && (
          <Tabs
            label="Reader menu"
            idPrefix={`${id}-menu`}
            look="line"
            tabs={SHEET_TABS}
            selected={tab}
            onSelect={setTab}
          />
        )}
        <IconButton size="sm" label={`Close ${name.toLowerCase()}`} onClick={() => close()}>
          <X aria-hidden="true" />
        </IconButton>
      </div>
      {menu ? (
        <div
          {...tabPanelProps(`${id}-menu`, tab)}
          className={styles.tabPanel}
          onClickCapture={(event) => {
            const action = event.target instanceof Element && event.target.closest('a, button');
            if (tab === 'chapter' && action) close(false);
          }}
        >
          {tab === 'chapter' ? (
            chapter
          ) : (
            <ReaderOptions preferences={preferences} onChange={update} part={tab} />
          )}
        </div>
      ) : (
        <>
          <ReaderOptions preferences={preferences} onChange={update} />
          <p className={styles.more}>
            <Settings aria-hidden="true" />
            <span>
              Downloads ahead and more are in <Link to="/settings">Settings</Link>.
            </span>
          </p>
        </>
      )}
    </div>
  );

  return (
    <div ref={rootRef} className={styles.root} onBlur={onBlur}>
      <IconButton
        ref={buttonRef}
        label={name}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        disabled={!preferences}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {menu ? <SlidersHorizontal aria-hidden="true" /> : <ALargeSmall aria-hidden="true" />}
      </IconButton>
      {open && preferences && (sheet ? createPortal(panel, document.body) : panel)}
    </div>
  );
}
