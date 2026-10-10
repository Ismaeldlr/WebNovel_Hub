import { createContext, useContext } from 'react';

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Choices to make: the toast then stays until one is picked or it is dismissed. */
  actions?: ToastAction[];
}

export type ShowToast = (toast: ToastOptions) => void;

export const ToastContext = createContext<ShowToast | null>(null);

/** Shows a short notification, announced to screen readers. */
export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast must be used inside ToastProvider');
  return show;
}
