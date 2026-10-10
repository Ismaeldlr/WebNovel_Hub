// The development bridge: gives the web app at localhost:5173 a real SQLite database and
// an HTTP client without cross-origin limits, through a small local HTTP service, so the
// app runs in an ordinary browser with hot reload. Development only; the shipped apps
// reach SQLite and the web directly.
import { mkdirSync } from 'node:fs';
import { type IncomingMessage, createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import type { HttpRequest } from '@webnovel-hub/core/scraper';
import { fromWire, toWire } from '@webnovel-hub/core/wire';
import { nodeHttpClient } from './http.js';
import { nodeSqliteDriver } from './sqlite.js';

const port = Number(process.env.WNH_BRIDGE_PORT ?? 5174);
// The repository's data/ folder, which git ignores.
const path = process.env.WNH_DEV_DB ?? resolve(import.meta.dirname, '../../../data/dev.db');
mkdirSync(dirname(path), { recursive: true });
const driver = nodeSqliteDriver(path);
const http = nodeHttpClient();

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

async function read(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

interface BridgeRequest {
  sql: string;
  values?: [];
  readsRows?: boolean;
  request: HttpRequest;
}

const server = createServer((request, response) => {
  const origin = request.headers.origin;
  const answer = (status: number, body: unknown) => {
    response.writeHead(status, { 'Content-Type': 'application/json' }).end(toWire(body));
  };
  // Only the app's own pages may use the bridge: a page from anywhere else could otherwise
  // change the database or fetch through it.
  if (origin !== undefined && !LOCAL_ORIGIN.test(origin)) {
    answer(403, { error: 'Only local pages may use the development bridge.' });
    return;
  }
  if (origin) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.setHeader('Access-Control-Allow-Methods', 'POST');
  }
  if (request.method === 'OPTIONS') {
    response.writeHead(204).end();
    return;
  }
  if (request.headers['content-type'] !== 'application/json') {
    answer(415, { error: 'The bridge takes JSON.' });
    return;
  }

  void (async () => {
    try {
      const body = fromWire<BridgeRequest>(await read(request));
      if (request.url === '/run') {
        answer(200, await driver.run(body.sql, body.values ?? [], body.readsRows ?? false));
      } else if (request.url === '/exec') {
        await driver.exec(body.sql);
        answer(200, {});
      } else if (request.url === '/http') {
        try {
          answer(200, await http.request(body.request));
        } catch (error) {
          // No answer from the site: the app reports it as a network error.
          answer(502, {
            error:
              error instanceof Error
                ? ((error.cause as Error | undefined)?.message ?? error.message)
                : String(error),
          });
        }
      } else {
        answer(404, { error: 'Not found.' });
      }
    } catch (error) {
      answer(500, { error: error instanceof Error ? error.message : String(error) });
    }
  })();
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Development bridge on http://127.0.0.1:${port}, database ${path}`);
});
