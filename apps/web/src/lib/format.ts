const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** A calendar date in the reader's locale, e.g. "Sep 27, 2026". */
export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(date));
}

/** A count with its noun: "1 chapter", "1,234 chapters". */
/** Minutes to read `words` at an unhurried 230 words a minute, never under one. */
export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 230));
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : pluralForm}`;
}

/** Today's date in `timeZone` (the device's when it is unknown), as `YYYY-MM-DD`. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const format = (zone?: string) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  try {
    return format(timeZone);
  } catch {
    return format(); // a zone name this browser doesn't know
  }
}

/** The date `days` before a `YYYY-MM-DD` date, in the same form. */
export function daysBefore(date: string, days: number): string {
  const time = Date.parse(`${date}T00:00:00Z`) - days * 86_400_000;
  return new Date(time).toISOString().slice(0, 10);
}

/**
 * A heading for a reading day (`YYYY-MM-DD`): "Today", "Yesterday", or the weekday and
 * date, with the year only when it isn't this one.
 */
export function formatDay(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === daysBefore(today, 1)) return 'Yesterday';
  return new Intl.DateTimeFormat(undefined, {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(date.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }),
  }).format(new Date(`${date}T00:00:00Z`));
}

/** A time of day in `timeZone`, e.g. "9:41 PM" (the device's zone when it is unknown). */
export function formatTime(iso: string, timeZone: string): string {
  const format = (zone?: string) =>
    new Intl.DateTimeFormat(undefined, { timeStyle: 'short', timeZone: zone }).format(
      new Date(iso),
    );
  try {
    return format(timeZone);
  } catch {
    return format();
  }
}

/** A file size for people: "850 KB", "12.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes.toLocaleString()} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value < 10 ? 1 : 0;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: digits })} ${units[unit]}`;
}

/** "just now", "5 minutes ago", "in 2 days": a human-readable relative time. */
export function formatRelativeTime(date: Date | string, now: Date = new Date()): string {
  const seconds = Math.round((new Date(date).getTime() - now.getTime()) / 1000);
  if (Math.abs(seconds) < 45) return 'just now';
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(Math.round(seconds / 60) || Math.sign(seconds), 'minute');
}

/** How long something took, roughly: "under a minute", "4 minutes", "2 hours 5 minutes". */
export function formatDuration(from: Date | string, to: Date | string): string {
  const minutes = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000);
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return plural(minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? plural(hours, 'hour') : `${plural(hours, 'hour')} ${plural(rest, 'minute')}`;
}
