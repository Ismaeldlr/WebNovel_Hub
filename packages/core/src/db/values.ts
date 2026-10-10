/** A new row id, for statements that need to know it before the row exists. */
export const newId = (): string => crypto.randomUUID();

/**
 * Text as searches and title sorting compare it: lower case and without accents, so
 * "unicode" finds "Ünïcode". SQLite only folds the case of ASCII letters itself.
 */
export const searchKey = (text: string | null): string =>
  (text ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

/** A 0/1 column as a boolean. */
export const bool = (value: unknown): boolean => value === 1 || value === true;

/** A JSON column, or `fallback` when it is NULL. */
export function parseJson<T>(value: unknown, fallback: T): T {
  return typeof value === 'string' ? (JSON.parse(value) as T) : fallback;
}

/** The reader's local date for a moment, as YYYY-MM-DD, in their device's time zone. */
export function localDay(at: Date = new Date(), timeZone = deviceTimeZone()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

export const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** The calendar date `days` days after (or before, when negative) a YYYY-MM-DD date. */
export function addDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}
