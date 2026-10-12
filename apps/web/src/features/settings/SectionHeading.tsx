import { type ReactNode } from 'react';
import styles from './SettingsPage.module.css';

/**
 * A settings section's title and, when the title can't say it alone, one line about it.
 * `hideOnPhone`: the phone's top bar already shows the title (a group's only section).
 */
export function SectionHeading({
  id,
  title,
  hideOnPhone = false,
  children,
}: {
  id: string;
  title: string;
  hideOnPhone?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={styles.heading} data-hide-on-phone={hideOnPhone || undefined}>
      <h2 id={id} className={styles.title}>
        {title}
      </h2>
      {children && <p className={styles.lead}>{children}</p>}
    </div>
  );
}
