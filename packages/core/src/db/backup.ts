import type { Database } from './database.js';
import { SCHEMA_VERSION } from './migrate.js';

/** What a library holds, shown before one replaces another. */
export interface LibrarySummary {
  /** Schema version (`PRAGMA user_version`). */
  version: number;
  novels: number;
  /** Chapters whose text is saved. */
  chapters: number;
  /** When a novel in it last changed (read, added, updated); null for an empty library. */
  lastChange: string | null;
}

/** Tables every library has had since the first version. */
const REQUIRED_TABLES = [
  'novels',
  'chapters',
  'chapter_contents',
  'library_entries',
  'reader_preferences',
];

/** A backup's file name for a day: `webnovel-hub-2026-10-11.whub`. */
export function backupFileName(day: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `webnovel-hub-${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}.whub`;
}

/**
 * Writes a copy of the library to `path`, which must not exist yet. The copy is one
 * compacted SQLite file, consistent even while jobs keep running.
 */
export async function writeBackup(db: Database, path: string): Promise<void> {
  await db.query('VACUUM INTO $1', [path]);
}

async function summarize(db: Database, schema: 'main' | 'candidate'): Promise<LibrarySummary> {
  const [version] = (await db.query<{ user_version: number }>(`PRAGMA ${schema}.user_version`))
    .rows;
  const [counts] = (
    await db.query<{ novels: number; chapters: number; last_change: string | null }>(
      `SELECT (SELECT count(*) FROM ${schema}.library_entries) AS novels,
              (SELECT count(*) FROM ${schema}.chapter_contents) AS chapters,
              (SELECT max(updated_at) FROM ${schema}.library_entries) AS last_change`,
    )
  ).rows;
  return {
    version: Number(version?.user_version ?? 0),
    novels: Number(counts?.novels ?? 0),
    chapters: Number(counts?.chapters ?? 0),
    lastChange: counts?.last_change ?? null,
  };
}

/** What the open library holds. */
export const summarizeLibrary = (db: Database): Promise<LibrarySummary> => summarize(db, 'main');

/**
 * Checks that the file at `path` is a library this version of the app can open (older ones
 * are migrated when it opens), and says what it holds. Throws an error worded for the
 * reader when it isn't.
 */
export async function inspectBackup(db: Database, path: string): Promise<LibrarySummary> {
  const unreadable = () => new Error("This file isn't a Webnovel Hub backup, or it is damaged.");
  try {
    await db.query('ATTACH DATABASE $1 AS candidate', [path]);
  } catch {
    throw unreadable();
  }
  try {
    let version: number;
    let tables: Set<string>;
    try {
      const [check] = (await db.query<{ quick_check: string }>('PRAGMA candidate.quick_check'))
        .rows;
      if (check?.quick_check !== 'ok') throw new Error('damaged');
      version = Number(
        (await db.query<{ user_version: number }>('PRAGMA candidate.user_version')).rows[0]
          ?.user_version ?? 0,
      );
      tables = new Set(
        (
          await db.query<{ name: string }>(
            "SELECT name FROM candidate.sqlite_master WHERE type = 'table'",
          )
        ).rows.map((row) => row.name),
      );
    } catch {
      throw unreadable();
    }
    if (version > SCHEMA_VERSION) {
      throw new Error(
        'This backup was made by a newer version of Webnovel Hub. Update the app, then restore it.',
      );
    }
    if (version < 1 || REQUIRED_TABLES.some((table) => !tables.has(table))) {
      throw new Error("This file isn't a Webnovel Hub backup.");
    }
    return await summarize(db, 'candidate');
  } finally {
    await db.query('DETACH DATABASE candidate').catch(() => undefined);
  }
}
