// The library database through the community SQLite plugin (SQLite 3.5x, bundled with
// SQLCipher; encryption off). Statements that return rows go through query(), the rest
// through run() outside the plugin's own transactions: the core opens and ends
// transactions itself on the one connection.
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import { type SqlDriver, type SqlValue, splitStatements } from '@webnovel-hub/core';

/** Stored as `librarySQLite.db` in the app's databases folder. */
const DATABASE = 'library';

/** The plugin takes bytes the way Node's Buffer turns into JSON. */
const toPlugin = (value: SqlValue): unknown =>
  value instanceof Uint8Array ? { type: 'Buffer', data: Array.from(value) } : value;

/** The plugin returns bytes as arrays of numbers; no other column holds an array. */
function fromPlugin(row: Record<string, unknown>): Record<string, unknown> {
  for (const [column, value] of Object.entries(row)) {
    if (Array.isArray(value)) row[column] = Uint8Array.from(value as number[]);
  }
  return row;
}

export async function capacitorDriver(): Promise<SqlDriver> {
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  // After the page reloads, the native side still holds the connection the old page
  // opened: this closes it, so the page opens its own.
  const consistent = (await sqlite.checkConnectionsConsistency()).result;
  const known = (await sqlite.isConnection(DATABASE, false)).result;
  const db =
    consistent && known
      ? await sqlite.retrieveConnection(DATABASE, false)
      : await sqlite.createConnection(DATABASE, false, 'no-encryption', 1, false);
  if (!(await db.isDBOpen()).result) await db.open();

  return {
    async run(sql, values, readsRows) {
      const bound = values.map(toPlugin);
      if (readsRows) {
        const { values: rows = [] } = await db.query(sql, bound);
        return { rows: (rows as Record<string, unknown>[]).map(fromPlugin), changes: 0 };
      }
      const { changes } = await db.run(sql, bound, false);
      return { rows: [], changes: changes?.changes ?? 0 };
    },
    // The plugin's own script splitting trips over triggers and comments.
    async exec(script) {
      for (const statement of splitStatements(script)) await db.run(statement, [], false);
    },
    close: () => sqlite.closeConnection(DATABASE, false),
  };
}
