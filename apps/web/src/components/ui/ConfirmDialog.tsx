import type { ReactNode } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** What will happen, in plain words. */
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** `danger` for destructive actions such as removing a novel. */
  tone?: 'default' | 'danger';
  /** The confirmed action is running: both buttons wait, and Escape is ignored. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Asks before a destructive action, in a modal Dialog: focus starts on the safe choice
 * (Cancel, the first button) and returns to where it was when the dialog closes.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'default',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      title={title}
      busy={busy}
      onCancel={onCancel}
      actions={
        <>
          <Button onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            busy={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
