import type { ReactNode } from 'react';
import styles from './StatTiles.module.css';

export interface StatTile {
  label: string;
  value: ReactNode;
  /** A short note under the value, e.g. "best: 12 days". */
  note?: string;
}

/** Headline numbers as a description list of tiles (history summary, profile). */
export function StatTiles({ label, tiles }: { label: string; tiles: StatTile[] }) {
  return (
    <section aria-label={label}>
      <dl className={styles.tiles}>
        {tiles.map((tile) => (
          <div key={tile.label} className={styles.tile}>
            <dt>{tile.label}</dt>
            <dd>
              {tile.value}
              {tile.note && <small>{tile.note}</small>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
