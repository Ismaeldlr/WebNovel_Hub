import styles from './ProgressBar.module.css';

interface ProgressBarProps {
  /** The accessible name, e.g. "Reading progress". */
  label: string;
  /** Null while the amount isn't known yet: the bar shows activity instead. */
  value: number | null;
  max?: number;
  /** What a screen reader says instead of a bare number, e.g. "Chapter 3 of 20". */
  valueText?: string;
  size?: 'sm' | 'md';
}

/** A labelled progress bar: reading progress, an import job. */
export function ProgressBar({ label, value, max = 100, valueText, size = 'md' }: ProgressBarProps) {
  const percent = value === null || max <= 0 ? null : Math.min(100, (value / max) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value ?? undefined}
      aria-valuetext={valueText}
      className={styles.track}
      data-size={size}
      data-indeterminate={percent === null || undefined}
    >
      <div className={styles.fill} style={{ width: `${percent ?? 35}%` }} />
    </div>
  );
}
