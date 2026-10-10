import type { Profile } from '@webnovel-hub/shared';
import { useId, useState } from 'react';
import { Button } from '../../components/ui';
import { formatDay, plural } from '../../lib/format';
import styles from './ProfilePage.module.css';

type Day = Profile['activity'][number];

/** 0 for no reading, else 1–4 by quarter of the busiest day. */
function level(chapters: number, most: number): number {
  if (chapters === 0 || most === 0) return 0;
  return Math.min(4, Math.ceil((chapters / most) * 4));
}

/** Sunday is 0, as in Date.getUTCDay, for a `YYYY-MM-DD` date. */
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/**
 * The last 90 days as a calendar heatmap: a column per week, one hue from the
 * surface (none) to the accent (the busiest days). Each cell names its day on hover, and
 * "Show as a table" lists every day read, so nothing depends on colour or a pointer.
 */
export function ActivityHeatmap({ activity, today }: { activity: Day[]; today: string }) {
  const [table, setTable] = useState(false);
  const tableId = useId();
  const most = Math.max(0, ...activity.map((day) => day.chapters));
  const active = activity.filter((day) => day.chapters > 0);
  const total = active.reduce((sum, day) => sum + day.chapters, 0);
  const first = activity[0]?.date;
  // Empty cells before the first day line the columns up by weekday.
  const padding = first === undefined ? 0 : weekday(first);

  return (
    <figure className={styles.heatmapFigure}>
      <div
        className={styles.heatmap}
        role="img"
        aria-label={`Reading activity: ${plural(total, 'chapter')} on ${plural(active.length, 'day')} of the last ${activity.length} days.`}
      >
        {Array.from({ length: padding }, (_, index) => (
          <span key={`pad-${index}`} className={styles.cell} data-empty />
        ))}
        {activity.map((day) => (
          <span
            key={day.date}
            className={styles.cell}
            data-level={level(day.chapters, most)}
            data-today={day.date === today || undefined}
            title={`${formatDay(day.date, today)}: ${plural(day.chapters, 'chapter')}`}
          />
        ))}
      </div>
      <figcaption className={styles.heatmapCaption}>
        <span>
          {plural(total, 'chapter')} on {plural(active.length, 'day')} in the last {activity.length}{' '}
          days.
        </span>
        <span className={styles.legend} aria-hidden="true">
          Less
          {[0, 1, 2, 3, 4].map((step) => (
            <span key={step} className={styles.cell} data-level={step} />
          ))}
          More
        </span>
      </figcaption>
      {active.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={table}
          aria-controls={tableId}
          onClick={() => setTable((shown) => !shown)}
        >
          {table ? 'Hide the table' : 'Show as a table'}
        </Button>
      )}
      <div id={tableId} hidden={!table}>
        <table className={styles.table}>
          <caption className="visually-hidden">Chapters read per day, last 90 days</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Chapters</th>
            </tr>
          </thead>
          <tbody>
            {[...active].reverse().map((day) => (
              <tr key={day.date}>
                <td>{formatDay(day.date, today)}</td>
                <td>{day.chapters.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
