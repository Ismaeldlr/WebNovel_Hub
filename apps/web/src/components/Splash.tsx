import { BrandMark } from './BrandMark';
import styles from './Splash.module.css';

/** Shown while the app restores the session or loads a screen. */
export function Splash() {
  return (
    <div className={styles.splash} role="status">
      <BrandMark className={styles.mark} />
      <p className={styles.text}>Opening your library…</p>
    </div>
  );
}
