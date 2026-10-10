import type { ReactNode } from 'react';
import styles from './ProfilePage.module.css';

export interface Bar {
  key: string;
  label: ReactNode;
  value: number;
}

/**
 * A single-series horizontal bar list (status, source, most read): one hue, thin bars
 * from a common baseline, the value at each bar's tip in text colour. Each row reads as
 * "label: value", so the numbers never depend on the bars.
 */
export function BarList({ bars, unit }: { bars: Bar[]; unit: (value: number) => string }) {
  const most = Math.max(1, ...bars.map((bar) => bar.value));
  return (
    <ul className={styles.bars}>
      {bars.map((bar) => (
        <li key={bar.key} className={styles.barRow}>
          <span className={styles.barLabel}>{bar.label}</span>
          <span className={styles.barTrack}>
            <span
              className={styles.bar}
              style={{ width: `${(bar.value / most) * 100}%` }}
              data-zero={bar.value === 0 || undefined}
            />
            <span className={styles.barValue}>
              {bar.value.toLocaleString()}
              <span className="visually-hidden"> {unit(bar.value)}</span>
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
