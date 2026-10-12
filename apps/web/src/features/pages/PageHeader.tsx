import { type ReactNode, useContext } from 'react';
import { createPortal } from 'react-dom';
import { COMPACT_QUERY } from '../../lib/breakpoints';
import { PageBarSlotContext, useMediaQuery, usePageTitle } from '../../lib/hooks';
import styles from './PageHeader.module.css';

interface PageHeaderProps {
  title: string;
  lead?: string;
  /** Buttons on the right, e.g. "Add a novel". */
  actions?: ReactNode;
  /** Phones: icon buttons for the top bar, shown there instead of `actions`. */
  barActions?: ReactNode;
}

/** The page's heading (its only h1) and document title. */
export function PageHeader({ title, lead, actions, barActions }: PageHeaderProps) {
  usePageTitle(title);
  const compact = useMediaQuery(COMPACT_QUERY);
  const inBar = compact && barActions !== undefined;
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        <h1 className={styles.title}>{title}</h1>
        {lead && <p className={styles.lead}>{lead}</p>}
      </div>
      {actions && !inBar && <div className={styles.actions}>{actions}</div>}
      {inBar && <BarActions>{barActions}</BarActions>}
    </header>
  );
}

/** Phones: puts its children (icon buttons) in the top bar, after search. Elsewhere nothing. */
export function BarActions({ children }: { children: ReactNode }) {
  const slot = useContext(PageBarSlotContext);
  const compact = useMediaQuery(COMPACT_QUERY);
  return compact && slot ? createPortal(children, slot) : null;
}
