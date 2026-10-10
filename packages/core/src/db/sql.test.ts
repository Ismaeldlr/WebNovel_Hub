import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS } from './migrate.js';
import { splitStatements } from './sql.js';

const schemaOf = (db: DatabaseSync) =>
  db.prepare('SELECT type, name, sql FROM sqlite_schema ORDER BY type, name').all();

describe('splitStatements', () => {
  it('splits every migration into statements that build the same schema one at a time', () => {
    const whole = new DatabaseSync(':memory:');
    const pieces = new DatabaseSync(':memory:');
    for (const migration of MIGRATIONS) {
      whole.exec(migration.sql);
      for (const statement of splitStatements(migration.sql)) pieces.prepare(statement).run();
    }
    expect(schemaOf(pieces)).toEqual(schemaOf(whole));
    expect(schemaOf(whole).length).toBeGreaterThan(10);
  });

  it("ignores semicolons in text and comments, and a trigger's own", () => {
    const script = `
      -- a comment; with a semicolon
      CREATE TABLE t (a TEXT DEFAULT 'x;y', "b;" INTEGER); /* also; here */
      CREATE TEMP TRIGGER t_ai AFTER INSERT ON t BEGIN
        UPDATE t SET a = CASE WHEN new.a = 'end;' THEN 'BEGIN' ELSE a END;
        SELECT 1;
      END;
      INSERT INTO t (a) VALUES ('one;two')
      -- the end`;
    expect(splitStatements(script)).toEqual([
      expect.stringMatching(/^-- a comment; with a semicolon\s+CREATE TABLE t .*\);$/s),
      expect.stringMatching(/^\/\* also; here \*\/\s+CREATE TEMP TRIGGER .*END;$/s),
      expect.stringMatching(/^INSERT INTO t \(a\) VALUES \('one;two'\)\s+-- the end$/s),
    ]);
  });

  it('drops pieces with nothing but comments and whitespace', () => {
    expect(splitStatements('BEGIN;\n-- nothing here\n;  ;COMMIT;')).toEqual(['BEGIN;', 'COMMIT;']);
  });
});
