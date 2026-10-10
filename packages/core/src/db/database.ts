import { migrate } from './migrate.js';
import { returnsRows, toPositional } from './sql.js';

/** A value SQLite stores as is. */
export type SqlValue = string | number | null | Uint8Array;

/**
 * One SQLite connection, provided by the platform (node:sqlite, Tauri, Capacitor). It runs
 * statements with `?` placeholders only; `createDatabase` does the rest.
 */
export interface SqlDriver {
  /** Runs one statement. `rows` is filled only when `readsRows` is true. */
  run(
    sql: string,
    values: SqlValue[],
    readsRows: boolean,
  ): Promise<{ rows: Record<string, unknown>[]; changes: number }>;
  /** Runs a script of statements without values, such as a migration. */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

export interface QueryResult<R> {
  rows: R[];
  /** Rows returned, or for statements that return none, rows changed. */
  rowCount: number;
}

/** Anything that runs parameterized SQL: the database, or a transaction in progress. */
export interface Queryable {
  query<R = Record<string, unknown>>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
}

export interface Database extends Queryable {
  /** Runs `work` in a transaction: committed if it resolves, rolled back if it throws. */
  withTransaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** What a JavaScript value is stored as: booleans as 0/1, dates as ISO text, objects as JSON. */
export function toSqlValue(value: unknown): SqlValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return value;
  return JSON.stringify(value);
}

/**
 * Wraps a driver: SQL is written with `$1`-style placeholders, statements run one at a
 * time on the single connection, and a transaction holds the connection until it ends.
 * Inside `withTransaction`, use the `tx` it passes: the database itself waits for it.
 */
export async function createDatabase(driver: SqlDriver): Promise<Database> {
  let queue: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(work: () => Promise<T>): Promise<T> => {
    const result = queue.then(work);
    queue = result.catch(() => undefined);
    return result;
  };

  const run = async <R>(text: string, values: unknown[] = []): Promise<QueryResult<R>> => {
    const statement = toPositional(text, values.map(toSqlValue));
    const reads = returnsRows(statement.sql);
    const { rows, changes } = await driver.run(statement.sql, statement.values, reads);
    return { rows: rows as R[], rowCount: reads ? rows.length : changes };
  };
  const tx: Queryable = { query: run };

  await driver.exec('PRAGMA foreign_keys = ON;');
  await migrate(driver);

  return {
    query: (text, values) => exclusive(() => run(text, values)),

    withTransaction: (work) =>
      exclusive(async () => {
        await driver.exec('BEGIN;');
        try {
          const result = await work(tx);
          await driver.exec('COMMIT;');
          return result;
        } catch (error) {
          await driver.exec('ROLLBACK;');
          throw error;
        }
      }),

    close: () => exclusive(() => driver.close()),
  };
}
