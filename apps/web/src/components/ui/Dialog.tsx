import { X } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef } from 'react';
import { useBackLayer } from '../../lib/hooks';
import { IconButton } from './Button';
import styles from './Dialog.module.css';

interface DialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  /** The buttons along the bottom. */
  actions?: ReactNode;
  /** Escape, the phone's back button or a click on the backdrop; ignored while `busy`. */
  onCancel: () => void;
  busy?: boolean;
  size?: 'md' | 'lg';
  /** Whether the body describes the dialog (a short message does; a form doesn't). */
  describe?: boolean;
  /**
   * `center`: a box in the middle. `sheet`: a panel at the right edge on larger screens and
   * rising from the bottom on phones, with a close button, for lists to pick from.
   */
  placement?: 'center' | 'sheet';
}

/**
 * A native modal <dialog>: the page behind it is inert, so focus stays inside; Escape or
 * a click on the backdrop cancels; focus returns to where it was when the dialog closes.
 * Focus starts on the first control, or on the one marked `data-autofocus` (React's
 * autoFocus never reaches the element, so showModal can't see it).
 */
export function Dialog({
  open,
  title,
  children,
  actions,
  onCancel,
  busy = false,
  size = 'md',
  describe = true,
  placement = 'center',
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocusTo.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      returnFocusTo.current?.focus();
    }
  }, [open]);

  const cancel = () => {
    if (!busy) onCancel();
  };
  useBackLayer(open, cancel);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      data-size={size}
      data-placement={placement}
      aria-labelledby={titleId}
      aria-describedby={describe ? bodyId : undefined}
      onCancel={(event) => {
        event.preventDefault(); // the parent decides whether it closes
        cancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) cancel(); // the backdrop
      }}
    >
      <div className={styles.panel}>
        <div className={styles.head}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {placement === 'sheet' && (
            <IconButton size="sm" label={`Close ${title.toLowerCase()}`} onClick={cancel}>
              <X aria-hidden="true" />
            </IconButton>
          )}
        </div>
        <div id={bodyId} className={styles.body}>
          {open && children}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </dialog>
  );
}
