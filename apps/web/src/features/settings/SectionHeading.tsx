import { type ReactNode } from 'react';
import styles from './SettingsPage.module.css';

/** A settings section's title and what it is about. */
export function SectionHeading({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.heading}>
      <h2 id={id} className={styles.title}>
        {title}
      </h2>
      <p className={styles.lead}>{children}</p>
    </div>
  );
}
