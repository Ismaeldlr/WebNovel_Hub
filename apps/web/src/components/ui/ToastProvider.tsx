import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { Button, IconButton } from './Button';
import { ToastContext, type ToastOptions, type ToastTone } from './toast';
import styles from './Toast.module.css';

interface ToastEntry extends ToastOptions {
  id: number;
  tone: ToastTone;
}

/** Longer for errors, which take more reading and matter more. */
const DURATION_MS: Record<ToastTone, number> = { info: 5_000, success: 5_000, error: 9_000 };
const MAX_TOASTS = 4;

const ICONS: Record<ToastTone, ReactNode> = {
  info: <Info aria-hidden="true" />,
  success: <CircleCheck aria-hidden="true" />,
  error: <CircleAlert aria-hidden="true" />,
};

let nextId = 0;

/**
 * Hosts the notifications. The live regions are always in the page, so screen readers
 * announce what is added to them: politely, or at once for errors.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback((toast: ToastOptions) => {
    const entry: ToastEntry = { tone: 'info', ...toast, id: (nextId += 1) };
    setToasts((current) => [...current, entry].slice(-MAX_TOASTS));
  }, []);

  const render = (tones: ToastTone[]) =>
    toasts
      .filter((toast) => tones.includes(toast.tone))
      .map((toast) => <Toast key={toast.id} toast={toast} onDismiss={dismiss} />);

  return (
    <ToastContext value={show}>
      {children}
      <section className={styles.viewport} aria-label="Notifications">
        <div role="status" className={styles.stack}>
          {render(['info', 'success'])}
        </div>
        <div role="alert" className={styles.stack}>
          {render(['error'])}
        </div>
      </section>
    </ToastContext>
  );
}

function Toast({ toast, onDismiss }: { toast: ToastEntry; onDismiss: (id: number) => void }) {
  // Paused while the pointer or keyboard focus is on it, so it can be read.
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || toast.actions?.length) return;
    const timer = window.setTimeout(() => onDismiss(toast.id), DURATION_MS[toast.tone]);
    return () => window.clearTimeout(timer);
  }, [paused, toast, onDismiss]);

  return (
    <div
      className={styles.toast}
      data-tone={toast.tone}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className={styles.icon}>{ICONS[toast.tone]}</span>
      <div className={styles.text}>
        <p className={styles.title}>{toast.title}</p>
        {toast.description && <p className={styles.description}>{toast.description}</p>}
        {toast.actions?.length ? (
          <div className={styles.actions}>
            {toast.actions.map((action) => (
              <Button
                key={action.label}
                size="sm"
                variant="secondary"
                onClick={() => {
                  onDismiss(toast.id);
                  action.onClick();
                }}
              >
                {action.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
      <IconButton size="sm" label="Dismiss notification" onClick={() => onDismiss(toast.id)}>
        <X aria-hidden="true" />
      </IconButton>
    </div>
  );
}
