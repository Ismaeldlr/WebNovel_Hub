import type { SqlValue } from './database.js';

/** The current time, in the format every timestamp column uses. */
export const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

/** The current time moved by an SQLite modifier such as `'-6 hours'` (a constant, never input). */
export const nowPlus = (modifier: string) => `strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '${modifier}')`;

/**
 * Turns `$1`-style placeholders into plain `?` ones, repeating values where a placeholder
 * repeats: every driver binds `?` by position, while numbered and named placeholders
 * differ between them. Quoted text and comments are left alone.
 */
export function toPositional(sql: string, values: SqlValue[]): { sql: string; values: SqlValue[] } {
  const bound: SqlValue[] = [];
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const char = sql[i]!;
    if (char === "'" || char === '"') {
      const end = closingQuote(sql, i, char);
      out += sql.slice(i, end);
      i = end;
    } else if (char === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      const stop = end === -1 ? sql.length : end;
      out += sql.slice(i, stop);
      i = stop;
    } else if (char === '$' && /\d/.test(sql[i + 1] ?? '')) {
      let j = i + 1;
      while (/\d/.test(sql[j] ?? '')) j++;
      const index = Number(sql.slice(i + 1, j)) - 1;
      if (index < 0 || index >= values.length) {
        throw new RangeError(`placeholder ${sql.slice(i, j)} has no value`);
      }
      bound.push(values[index]!);
      out += '?';
      i = j;
    } else {
      out += char;
      i++;
    }
  }
  return { sql: out, values: bound };
}

function closingQuote(sql: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < sql.length) {
    if (sql[i] === quote) {
      if (sql[i + 1] === quote) i += 2;
      else return i + 1;
    } else i++;
  }
  return sql.length;
}

/**
 * Splits a script into its statements, for drivers that run one statement at a time
 * (Capacitor's). A `;` ends a statement unless it is quoted, in a comment, or inside a
 * trigger's `BEGIN … END` (where `CASE … END` nests too). Comment-only pieces are dropped.
 */
export function splitStatements(script: string): string[] {
  const statements: string[] = [];
  let start = 0;
  let words: string[] = []; // the statement's first words, to tell a trigger
  let depth = 0;
  let i = 0;
  const inTrigger = () =>
    words[0] === 'CREATE' &&
    (words[1] === 'TRIGGER' ||
      ((words[1] === 'TEMP' || words[1] === 'TEMPORARY') && words[2] === 'TRIGGER'));

  while (i < script.length) {
    const char = script[i]!;
    if (char === "'" || char === '"' || char === '`') {
      i = closingQuote(script, i, char);
    } else if (char === '[') {
      const end = script.indexOf(']', i);
      i = end === -1 ? script.length : end + 1;
    } else if (char === '-' && script[i + 1] === '-') {
      const end = script.indexOf('\n', i);
      i = end === -1 ? script.length : end + 1;
    } else if (char === '/' && script[i + 1] === '*') {
      const end = script.indexOf('*/', i + 2);
      i = end === -1 ? script.length : end + 2;
    } else if (/[A-Za-z_]/.test(char)) {
      let j = i + 1;
      while (/\w/.test(script[j] ?? '')) j++;
      const word = script.slice(i, j).toUpperCase();
      if (words.length < 3) words.push(word);
      if (inTrigger()) {
        if (word === 'BEGIN' || word === 'CASE') depth++;
        else if (word === 'END') depth--;
      }
      i = j;
    } else if (char === ';' && depth <= 0) {
      if (words.length > 0) statements.push(script.slice(start, i + 1).trim());
      start = i + 1;
      words = [];
      depth = 0;
      i++;
    } else {
      i++;
    }
  }
  if (words.length > 0) statements.push(script.slice(start).trim());
  return statements;
}

/** Whether a statement returns rows: queries, and changes with RETURNING. */
export function returnsRows(sql: string): boolean {
  if (/\breturning\b/i.test(sql)) return true;
  const start = sql.trimStart().slice(0, 7).toLowerCase();
  if (/^(select|values|pragma)\b/.test(start)) return true;
  return start.startsWith('with') && !/\b(insert|update|delete)\b/i.test(sql);
}
