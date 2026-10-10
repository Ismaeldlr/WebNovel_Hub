import { Check } from 'lucide-react';
import { type CSSProperties, type ReactNode, useId } from 'react';
import styles from './ChoiceGroup.module.css';

interface ChoiceGroupProps<T extends string, O extends { value: T; label: string }> {
  legend: string;
  value: T;
  options: readonly O[];
  onChange: (value: T) => void;
  /** `tiles`: small squares in a row (themes, widths). `list`: wider rows (fonts). */
  layout: 'tiles' | 'list';
  /** The option's face; `detailId` names an element that describes it (optional). */
  render: (option: O, detailId: string) => ReactNode;
}

/**
 * A radio group drawn as tiles or a list: arrow keys move and choose, as with any radios.
 * The chosen one has a heavier border, a check mark and a bold name, never colour alone.
 */
export function ChoiceGroup<T extends string, O extends { value: T; label: string }>({
  legend,
  value,
  options,
  onChange,
  layout,
  render,
}: ChoiceGroupProps<T, O>) {
  const name = useId();
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.choices} data-layout={layout}>
        {options.map((option) => {
          const detailId = `${name}-${option.value}-detail`;
          return (
            <label key={option.value} className={styles.choice}>
              <input
                type="radio"
                name={name}
                value={option.value}
                aria-label={option.label}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
                aria-describedby={layout === 'list' ? detailId : undefined}
                className={styles.radio}
              />
              {render(option, detailId)}
              <Check className={styles.check} aria-hidden="true" />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** A choice's name: bold when it is the one chosen. */
export function ChoiceLabel({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span className={className ? `${styles.label} ${className}` : styles.label} style={style}>
      {children}
    </span>
  );
}
