import { ChevronDown, Eye, EyeOff } from 'lucide-react';
import { type ComponentProps, type ReactNode, useId, useState } from 'react';
import { IconButton } from './Button';
import styles from './Fields.module.css';

interface FieldFrameProps {
  id: string;
  label: string;
  hideLabel?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
}

function FieldFrame({ id, label, hideLabel, hint, error, children }: FieldFrameProps) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={hideLabel ? 'visually-hidden' : styles.label}>
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

function describedBy(id: string, hint?: string, error?: string) {
  if (error) return `${id}-error`;
  return hint ? `${id}-hint` : undefined;
}

export interface TextFieldProps extends Omit<ComponentProps<'input'>, 'id'> {
  label: string;
  hideLabel?: boolean;
  /** Help shown under the field until there is an error. */
  hint?: string;
  /** Shown under the field, and marks it invalid for assistive technology. */
  error?: string;
}

/** A labelled text input. Password fields get a show/hide toggle. */
export function TextField({
  label,
  hideLabel,
  hint,
  error,
  type = 'text',
  ...rest
}: TextFieldProps) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password';
  return (
    <FieldFrame id={id} label={label} hideLabel={hideLabel} hint={hint} error={error}>
      <div className={styles.control} data-invalid={error ? true : undefined}>
        <input
          id={id}
          type={isPassword && revealed ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={styles.input}
          {...rest}
        />
        {isPassword && (
          <IconButton
            size="sm"
            label={revealed ? 'Hide password' : 'Show password'}
            aria-pressed={revealed}
            className={styles.adornment}
            onClick={() => setRevealed((value) => !value)}
          >
            {revealed ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </IconButton>
        )}
      </div>
    </FieldFrame>
  );
}

export interface TextAreaProps extends Omit<ComponentProps<'textarea'>, 'id'> {
  label: string;
  hideLabel?: boolean;
  hint?: string;
  error?: string;
}

/** A labelled multi-line text input. */
export function TextArea({ label, hideLabel, hint, error, ...rest }: TextAreaProps) {
  const id = useId();
  return (
    <FieldFrame id={id} label={label} hideLabel={hideLabel} hint={hint} error={error}>
      <div className={styles.control} data-invalid={error ? true : undefined}>
        <textarea
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={`${styles.input} ${styles.textarea}`}
          {...rest}
        />
      </div>
    </FieldFrame>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<ComponentProps<'select'>, 'id' | 'children'> {
  label: string;
  hideLabel?: boolean;
  hint?: string;
  error?: string;
  options: readonly SelectOption[];
}

/** A labelled native select: keyboard and screen-reader support come with it. */
export function Select({ label, hideLabel, hint, error, options, ...rest }: SelectProps) {
  const id = useId();
  return (
    <FieldFrame id={id} label={label} hideLabel={hideLabel} hint={hint} error={error}>
      <div className={styles.control} data-invalid={error ? true : undefined}>
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={styles.select}
          {...rest}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className={styles.chevron} aria-hidden="true" />
      </div>
    </FieldFrame>
  );
}
