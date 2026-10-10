import type { ReactNode } from 'react';
import styles from './SkipLink.module.css';

/**
 * "Skip to content": the first stop for keyboard users, hidden until it has focus
 *. `href` is the id of the page's main landmark, e.g. `#main`.
 */
export function SkipLink({ href, children }: { href: `#${string}`; children: ReactNode }) {
  return (
    <a href={href} className={styles.skipLink}>
      {children}
    </a>
  );
}
