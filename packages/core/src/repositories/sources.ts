import type { SourceRef, SourceSite } from '@webnovel-hub/shared';
import type { Queryable } from '../db/database.js';
import { bool, parseJson } from '../db/values.js';

interface SourceRow {
  key: string;
  name: string;
  home_url: string | null;
  hosts: string;
  importable: number;
  in_progress: number;
}

/** Every source site: importable ones first, then by name. */
export async function listSources(db: Queryable): Promise<SourceSite[]> {
  const { rows } = await db.query<SourceRow>(
    `SELECT key, name, home_url, hosts, importable, in_progress FROM source_sites
     ORDER BY importable DESC, name`,
  );
  return rows.map((row) => ({
    key: row.key,
    name: row.name,
    homeUrl: row.home_url,
    hosts: parseJson<string[]>(row.hosts, []),
    importable: bool(row.importable),
    inProgress: bool(row.in_progress),
  }));
}

/** The importable source whose hosts include `host` (lower-case), if any. */
export async function findImportableSource(db: Queryable, host: string): Promise<SourceRef | null> {
  const { rows } = await db.query<SourceRef>(
    `SELECT key, name FROM source_sites
     WHERE importable = 1 AND EXISTS (SELECT 1 FROM json_each(hosts) WHERE value = $1)
     ORDER BY key LIMIT 1`,
    [host],
  );
  return rows[0] ?? null;
}

/** Display names of the sources users can import from, alphabetically. */
export async function importableSourceNames(db: Queryable): Promise<string[]> {
  const { rows } = await db.query<{ name: string }>(
    'SELECT name FROM source_sites WHERE importable = 1 ORDER BY name',
  );
  return rows.map((row) => row.name);
}
