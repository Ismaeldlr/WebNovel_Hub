import type { ReactNode } from 'react';
import styles from './Badge.module.css';

export type BadgeTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger';

interface BadgeProps {
  tone?: BadgeTone;
  /** A decorative icon. The text must carry the meaning on its own. */
  icon?: ReactNode;
  children: ReactNode;
}

/** A small label: a source, a status, "NEW 3". */
export function Badge({ tone = 'neutral', icon, children }: BadgeProps) {
  return (
    <span className={styles.badge} data-tone={tone}>
      {icon}
      {children}
    </span>
  );
}
