import { LoaderCircle } from 'lucide-react';
import styles from './Spinner.module.css';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  /** Read by screen readers. Ignored when `decorative`. */
  label?: string;
  /** Hidden from assistive technology, e.g. inside a busy button that says what it does. */
  decorative?: boolean;
}

export function Spinner({ size = 'md', label = 'Loading', decorative = false }: SpinnerProps) {
  const icon = <LoaderCircle className={styles.spinner} data-size={size} aria-hidden="true" />;
  if (decorative) return icon;
  return (
    <span role="status" className={styles.wrapper}>
      {icon}
      <span className="visually-hidden">{label}</span>
    </span>
  );
}
