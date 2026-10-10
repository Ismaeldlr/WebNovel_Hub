import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

type SqlValue = string | number | null | Uint8Array;

/** Runs synchronous work as a promise, so a thrown error becomes a rejection. */
const settle = <T>(work: () => T): Promise<T> => new Promise((resolve) => resolve(work()));

/** A core `SqlDriver` over node:sqlite; `:memory:` for a throwaway database. */
export function nodeSqliteDriver(path: string) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  return {
    run: (sql: string, values: SqlValue[], readsRows: boolean) =>
      settle(() => {
        const statement = db.prepare(sql);
        const args = values as SQLInputValue[];
        if (readsRows) {
          return { rows: statement.all(...args), changes: 0 };
        }
        return { rows: [], changes: Number(statement.run(...args).changes) };
      }),
    exec: (sql: string) => settle(() => db.exec(sql)),
    close: () => settle(() => db.close()),
  };
}
