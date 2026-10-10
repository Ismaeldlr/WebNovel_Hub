import { type ReactNode, useId } from 'react';
import styles from './Slider.module.css';

interface Step {
  label: string;
  icon: ReactNode;
}

interface SliderProps {
  label: string;
  value: number;
  limits: { min: number; max: number; step: number };
  /** The value as shown next to the label, and as read out. */
  shown: (value: number) => string;
  spoken: (value: number) => string;
  decrease: Step;
  increase: Step;
  onChange: (value: number) => void;
}

/**
 * A native slider (arrows, Page Up/Down, Home, End), with − and + buttons beside it for
 * pointers. The buttons repeat what the slider does, so they stay out of the tab order and
 * out of the accessibility tree; the slider reads out its value.
 */
export function Slider({
  label,
  value,
  limits,
  shown,
  spoken,
  decrease,
  increase,
  onChange,
}: SliderProps) {
  const id = useId();
  const { min, max, step } = limits;
  const decimals = step < 1 ? 1 : 0;
  const set = (next: number) => {
    const clamped = Math.min(max, Math.max(min, Number(next.toFixed(decimals))));
    if (clamped !== value) onChange(clamped);
  };

  return (
    <div className={styles.field}>
      <div className={styles.head}>
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
        <span className={styles.value} aria-hidden="true">
          {shown(value)}
        </span>
      </div>
      <div className={styles.slider}>
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          title={decrease.label}
          className={styles.step}
          disabled={value <= min}
          onClick={() => set(value - step)}
        >
          {decrease.icon}
        </button>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-valuetext={spoken(value)}
          onChange={(event) => set(Number(event.target.value))}
          className={styles.range}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          title={increase.label}
          className={styles.step}
          disabled={value >= max}
          onClick={() => set(value + step)}
        >
          {increase.icon}
        </button>
      </div>
    </div>
  );
}
