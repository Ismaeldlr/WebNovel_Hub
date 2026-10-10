import type { ReactNode } from 'react';
import { usePageTitle } from '../../lib/hooks';
import styles from './PageHeader.module.css';

interface PageHeaderProps {
  title: string;
  lead?: string;
  /** Buttons on the right, e.g. "Add a novel". */
  actions?: ReactNode;
}

/** The page's heading (its only h1) and document title. */
export function PageHeader({ title, lead, actions }: PageHeaderProps) {
  usePageTitle(title);
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        <h1 className={styles.title}>{title}</h1>
        {lead && <p className={styles.lead}>{lead}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
