import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './Button';
import { Spinner } from './Spinner';
import styles from './States.module.css';

interface EmptyStateProps {
  /** A decorative icon. */
  icon?: ReactNode;
  title: string;
  /** The heading level that fits the page's outline. */
  headingLevel?: 1 | 2 | 3;
  children?: ReactNode;
  /** Usually one button or link: what to do next. */
  action?: ReactNode;
}

/** Nothing to show yet, and what to do about it. */
export function EmptyState({ icon, title, headingLevel = 2, children, action }: EmptyStateProps) {
  const Heading = (['h1', 'h2', 'h3'] as const)[headingLevel - 1] ?? 'h2';
  return (
    <div className={styles.state}>
      {icon && <div className={styles.icon}>{icon}</div>}
      <Heading className={styles.title}>{title}</Heading>
      {children && <div className={styles.body}>{children}</div>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  /** A user-safe explanation, e.g. an ApiError's message. */
  message: string;
  headingLevel?: 1 | 2 | 3;
  onRetry?: () => void;
  retrying?: boolean;
}

/** Something failed; says what and offers to try again. Announced to screen readers. */
export function ErrorState({
  title = 'Something went wrong',
  message,
  headingLevel = 2,
  onRetry,
  retrying = false,
}: ErrorStateProps) {
  const Heading = (['h1', 'h2', 'h3'] as const)[headingLevel - 1] ?? 'h2';
  return (
    <div className={styles.state} data-tone="error" role="alert">
      <div className={styles.icon}>
        <CircleAlert aria-hidden="true" />
      </div>
      <Heading className={styles.title}>{title}</Heading>
      <p className={styles.body}>{message}</p>
      {onRetry && (
        <div className={styles.action}>
          <Button onClick={onRetry} busy={retrying}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Grey lines where text is coming (§5.4): the page keeps its shape while it loads. Read
 * out once as `label`; the lines themselves are hidden from screen readers.
 */
export function Skeleton({ label, lines = 8 }: { label: string; lines?: number }) {
  return (
    <div role="status" className={styles.skeleton}>
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} className={styles.line} aria-hidden="true" />
      ))}
    </div>
  );
}

/** A large spinner in the space a list or page will fill, read out as `label`. */
export function LoadingState({ label }: { label: string }) {
  return (
    <div className={styles.loading}>
      <Spinner size="lg" label={label} />
    </div>
  );
}
