import type { HttpClient, SqlDriver } from '@webnovel-hub/core';
import { fromWire, toWire } from '@webnovel-hub/core/wire';

/** The development bridge (`npm run dev` starts it next to Vite). */
function bridge(url: string) {
  return async <T>(path: string, body: unknown): Promise<T> => {
    const response = await fetch(`${url}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: toWire(body),
    });
    const data = fromWire<T & { error?: string }>(await response.text());
    if (!response.ok) throw new Error(data.error ?? `The bridge answered ${response.status}.`);
    return data;
  };
}

/** SQLite through the development bridge. */
export function devBridgeDriver(url: string): SqlDriver {
  const post = bridge(url);
  return {
    run: (sql, values, readsRows) =>
      post<{ rows: Record<string, unknown>[]; changes: number }>('/run', {
        sql,
        values,
        readsRows,
      }),
    exec: async (sql) => {
      await post('/exec', { sql });
    },
    close: () => Promise.resolve(),
  };
}

/** Requests to source sites, sent by the development bridge. */
export function devBridgeHttp(url: string): HttpClient {
  const post = bridge(url);
  return { request: (request) => post('/http', { request }) };
}
