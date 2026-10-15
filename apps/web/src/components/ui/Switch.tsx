import { type ReactNode, useId } from 'react';
import styles from './Switch.module.css';

interface SwitchProps {
  label: string;
  /** A line under the label saying what it does. */
  detail?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/**
 * An on/off setting as a row: the label and its detail, and a switch at the end. A checkbox
 * with the switch role underneath, so it is read as on or off; the knob's side shows the
 * state, not colour alone.
 */
export function Switch({ label, detail, checked, onChange, disabled = false }: SwitchProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const detailId = `${id}-detail`;
  return (
    <label className={styles.row} data-disabled={disabled || undefined}>
      <span className={styles.text}>
        <span id={labelId} className={styles.label}>
          {label}
        </span>
        {detail && (
          <span id={detailId} className={styles.detail}>
            {detail}
          </span>
        )}
      </span>
      <input
        type="checkbox"
        role="switch"
        className={styles.input}
        checked={checked}
        disabled={disabled}
        aria-labelledby={labelId}
        aria-describedby={detail ? detailId : undefined}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={styles.track} aria-hidden="true">
        <span className={styles.knob} />
      </span>
    </label>
  );
}
