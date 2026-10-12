import { Check } from 'lucide-react';
import {
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { COMPACT_QUERY } from '../../lib/breakpoints';
import { useDismiss, useMediaQuery } from '../../lib/hooks';
import styles from './Menu.module.css';
import { PopoverContext } from './popover';

/** Props to spread on the element that opens a menu or popover. */
export interface TriggerProps {
  ref: Ref<HTMLButtonElement>;
  id: string;
  'aria-expanded': boolean;
  'aria-controls': string;
  'aria-haspopup'?: 'menu';
  onClick: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

const ITEM_SELECTOR = '[role="menuitem"], [role="menuitemradio"]';

const MenuContext = createContext<{ close: () => void } | null>(null);

interface MenuProps {
  /** Renders the button that opens the menu. */
  trigger: (props: TriggerProps) => ReactNode;
  children: ReactNode;
  align?: 'start' | 'end';
}

/**
 * An action menu (WAI-ARIA menu button pattern): Enter, Space or ↓ opens it on the first
 * item (↑ on the last, or the checked one); ↑ ↓ Home End move; Escape closes and returns
 * focus to the button; Tab or a click outside closes it. On phones it rises from the
 * bottom as a sheet over a scrim, and a tap on the scrim closes it.
 */
export function Menu({ trigger, children, align = 'end' }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState<'first' | 'last' | 'checked'>('checked');
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();
  // Phones: the sheet goes to the end of the page, clear of the bars' layers.
  const sheet = useMediaQuery(COMPACT_QUERY);

  const items = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useDismiss(open, [rootRef, menuRef], (reason) => close(reason === 'escape'));

  useEffect(() => {
    if (!open) return;
    const all = Array.from(menuRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);
    const checked = all.find((item) => item.getAttribute('aria-checked') === 'true');
    const target =
      start === 'last' ? all.at(-1) : start === 'checked' ? (checked ?? all[0]) : all[0];
    target?.focus();
  }, [open, start]);

  const openAt = (position: 'first' | 'last' | 'checked') => {
    setStart(position);
    setOpen(true);
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openAt(event.key === 'ArrowDown' ? 'first' : 'last');
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const all = items();
    const index = all.indexOf(document.activeElement as HTMLElement);
    const focus = (next: number) => {
      event.preventDefault();
      all[(next + all.length) % all.length]?.focus();
    };
    if (event.key === 'ArrowDown') focus(index + 1);
    else if (event.key === 'ArrowUp') focus(index - 1);
    else if (event.key === 'Home') focus(0);
    else if (event.key === 'End') focus(all.length - 1);
    else if (event.key === 'Tab') close(false);
  };

  const menu = (
    <>
      {sheet && <div className={styles.scrim} aria-hidden="true" onClick={() => close()} />}
      <div
        ref={menuRef}
        id={`${id}-menu`}
        role="menu"
        aria-labelledby={`${id}-button`}
        className={styles.menu}
        data-align={align}
        onKeyDown={onMenuKeyDown}
      >
        <MenuContext value={{ close }}>{children}</MenuContext>
      </div>
    </>
  );

  return (
    <div ref={rootRef} className={styles.root}>
      {trigger({
        ref: triggerRef,
        id: `${id}-button`,
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': `${id}-menu`,
        onClick: () => (open ? close() : openAt('checked')),
        onKeyDown: onTriggerKeyDown,
      })}
      {open && (sheet ? createPortal(menu, document.body) : menu)}
    </div>
  );
}

interface MenuItemProps {
  onSelect: () => void;
  /** A decorative icon. */
  icon?: ReactNode;
  /** Makes this one of a set of choices (menuitemradio), checked or not. */
  checked?: boolean;
  /** `danger`: an action that destroys something, e.g. Delete. */
  tone?: 'danger';
  children: ReactNode;
}

export function MenuItem({ onSelect, icon, checked, tone, children }: MenuItemProps) {
  const menu = useContext(MenuContext);
  const radio = checked !== undefined;
  return (
    <button
      type="button"
      role={radio ? 'menuitemradio' : 'menuitem'}
      aria-checked={radio ? checked : undefined}
      tabIndex={-1}
      className={styles.item}
      data-tone={tone}
      onClick={() => {
        menu?.close();
        onSelect();
      }}
    >
      <span className={styles.itemIcon}>{icon}</span>
      <span className={styles.itemLabel}>{children}</span>
      {checked && <Check className={styles.check} aria-hidden="true" />}
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className={styles.separator} />;
}

/** A non-interactive heading inside a menu, e.g. what its items choose. */
export function MenuHeader({ children }: { children: ReactNode }) {
  return (
    <div role="presentation" className={styles.header}>
      {children}
    </div>
  );
}

interface PopoverProps {
  trigger: (props: TriggerProps) => ReactNode;
  /** The panel's accessible name. */
  label: string;
  /** The panel's content; content that picks something closes it with usePopoverClose. */
  children: ReactNode;
  align?: 'start' | 'end';
}

/**
 * A panel of information that opens from a button (disclosure pattern). Focus moves into
 * the panel; Escape or a click outside closes it.
 */
export function Popover({ trigger, label, children, align = 'end' }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useDismiss(open, [rootRef], (reason) => close(reason === 'escape'));

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  return (
    <div ref={rootRef} className={styles.root}>
      {trigger({
        ref: triggerRef,
        id: `${id}-button`,
        'aria-expanded': open,
        'aria-controls': `${id}-panel`,
        onClick: () => (open ? close() : setOpen(true)),
      })}
      {open && (
        <div
          ref={panelRef}
          id={`${id}-panel`}
          role="group"
          aria-label={label}
          tabIndex={-1}
          className={`${styles.menu} ${styles.popover}`}
          data-align={align}
        >
          <PopoverContext value={close}>{children}</PopoverContext>
        </div>
      )}
    </div>
  );
}
