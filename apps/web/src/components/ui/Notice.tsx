import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Notice.module.css';

export type NoticeTone = 'neutral' | 'ok' | 'warn' | 'danger';

interface NoticeProps extends HTMLAttributes<HTMLElement> {
  /** The message's colour; its icon and words say the same, never colour alone. */
  tone?: NoticeTone;
  /**
   * `box`: a tinted panel. `inline`: icon and text straight on the page, e.g. a result under
   * a button. `band`: a full-width strip across the top of the page.
   */
  variant?: 'box' | 'inline' | 'band';
  icon?: ReactNode;
  /** A paragraph by default; a `div` when the message holds more than text (a spinner). */
  as?: 'p' | 'div';
  children: ReactNode;
}

/**
 * A short message with an icon: a problem, a warning, a result or a hint. The one place such
 * messages are styled; pass `role` (status, alert, note) as the message needs.
 */
export function Notice({
  tone = 'neutral',
  variant = 'box',
  icon,
  as: Tag = 'p',
  className,
  children,
  ...rest
}: NoticeProps) {
  return (
    <Tag
      {...rest}
      className={className ? `${styles.notice} ${className}` : styles.notice}
      data-tone={tone}
      data-variant={variant}
    >
      {icon}
      <span className={styles.body}>{children}</span>
    </Tag>
  );
}
