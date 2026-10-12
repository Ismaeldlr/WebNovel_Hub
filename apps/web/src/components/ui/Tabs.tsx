import { type KeyboardEvent, useRef } from 'react';
import styles from './Tabs.module.css';

export interface TabItem<Id extends string> {
  id: Id;
  label: string;
  /** With `chips`, shown after the label on phones (e.g. how many novels). */
  count?: number;
}

interface TabsProps<Id extends string> {
  /** The tab list's accessible name. */
  label: string;
  tabs: readonly TabItem<Id>[];
  selected: Id;
  onSelect: (id: Id) => void;
  /** Prefix for the tab ids (`<prefix>-tab-<id>`) and the panel id (`<prefix>-panel`). */
  idPrefix: string;
  /** Phones: separate chips in a row that scrolls sideways, with their counts. */
  chips?: boolean;
}

/**
 * A tab list (WAI-ARIA tabs pattern): ← → Home End move between tabs and select them.
 * Render the panel with `tabPanelProps(idPrefix, selected)` from ./tabPanel.
 */
export function Tabs<Id extends string>({
  label,
  tabs,
  selected,
  onSelect,
  idPrefix,
  chips = false,
}: TabsProps<Id>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    const target = next === null ? undefined : tabs[next];
    if (next === null || !target) return;
    event.preventDefault();
    onSelect(target.id);
    refs.current[next]?.focus();
  };

  return (
    <div role="tablist" aria-label={label} className={styles.tabs} data-chips={chips || undefined}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          ref={(element) => {
            refs.current[index] = element;
          }}
          type="button"
          role="tab"
          id={`${idPrefix}-tab-${tab.id}`}
          aria-selected={tab.id === selected}
          aria-controls={`${idPrefix}-panel`}
          tabIndex={tab.id === selected ? 0 : -1}
          className={styles.tab}
          onClick={() => onSelect(tab.id)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className={styles.count} aria-hidden="true">
              {tab.count.toLocaleString()}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
