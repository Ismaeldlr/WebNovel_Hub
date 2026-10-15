import type { CheckList } from './background/checks.js';
import { buildCheckList } from './background/list.js';
import { type LibrarySummary, inspectBackup, summarizeLibrary, writeBackup } from './db/backup.js';
import { type Database, type SqlDriver, createDatabase } from './db/database.js';
import { wantsNotice } from './jobs/notice.js';
import { type QueueStatus, queueStatus } from './jobs/queue.js';
import { JobRunner } from './jobs/runner.js';
import { type Logger, silentLogger } from './logger.js';
import { findPreferences } from './repositories/preferences.js';
import { type CoreRequest, type CoreResponse, createRouter } from './router/router.js';
import { createRoutes } from './router/routes.js';
import { defaultRegistry } from './scraper/adapters/registry.js';
import type { HttpClient, Notice, PageRenderer } from './scraper/http.js';
import { HostThrottle } from './scraper/session.js';
import { publishSources } from './scraper/sources.js';
import { createAccountService } from './services/accounts.js';
import { createCatalogService } from './services/catalog.js';
import { createEpubExportService } from './services/epub-export.js';
import { createEpubImportService } from './services/epub-import.js';
import { createFullFetchService } from './services/full-fetch.js';
import { createHistoryService } from './services/history.js';
import { createImportService } from './services/imports.js';
import { createLibraryService } from './services/library.js';
import { createNovelManagementService } from './services/novel-management.js';
import { createPrefetcher } from './services/prefetch.js';
import { createPreferencesService } from './services/preferences.js';
import { createReaderService } from './services/reader.js';
import { createShelfService } from './services/shelves.js';
import { createTermService } from './services/terms.js';
import { createUpdateService } from './services/updates.js';

export interface CoreOptions {
  /** The platform's SQLite connection. */
  driver: SqlDriver;
  logger?: Logger;
  /** How often a failed fetch is retried before it fails for good. */
  maxRetries?: number;
  /** The platform's HTTP client. Without one, nothing is fetched from source sites. */
  http?: HttpClient;
  /** Renders pages whose text only their scripts produce, where the platform can. */
  renderer?: PageRenderer;
  /** Milliseconds between two requests to one site, unless its adapter asks for more. */
  requestDelay?: number;
  /**
   * Shows a system notification (new chapters found by a scheduled check, a finished
   * download, a problem), unless the reader turned that kind off.
   */
  notify?: (notice: Notice) => void;
}

export interface Core {
  db: Database;
  /** Answers a request the way the REST API did, without a server. */
  dispatch(request: CoreRequest): Promise<CoreResponse>;
  /** Fetches what the reader asked for (imports, chapters, updates); null without HTTP. */
  runner: JobRunner | null;
  /** The jobs running and due soon, for a platform showing that work goes on. */
  queueStatus(): Promise<QueueStatus>;
  /** What a background task checks while the app is closed (see background/checks.ts). */
  checkList(): Promise<CheckList>;
  backups: {
    /** Writes a copy of the library to a file that doesn't exist yet. */
    write(path: string): Promise<void>;
    /** What a backup file holds; throws, worded for the reader, when it can't be restored. */
    inspect(path: string): Promise<LibrarySummary>;
    /** What the open library holds. */
    summary(): Promise<LibrarySummary>;
  };
  /**
   * Stops the jobs and closes the database with everything written to its main file, so
   * the platform can move the file (to put a backup in its place).
   */
  release(): Promise<void>;
  close(): Promise<void>;
}

/** Opens (and migrates) the library database and starts the app's services. */
export async function createCore(options: CoreOptions): Promise<Core> {
  const logger = options.logger ?? silentLogger;
  const maxRetries = options.maxRetries ?? 3;
  const db = await createDatabase(options.driver);
  const registry = defaultRegistry();
  await publishSources(db, registry);
  const notify =
    options.notify &&
    ((notice: Notice) => {
      findPreferences(db).then(
        (preferences) => {
          if (wantsNotice(preferences, notice.kind)) options.notify!(notice);
        },
        (error: unknown) => logger.warn({ err: error }, 'could not read the notification setting'),
      );
    });
  const fetcher = options.http
    ? {
        http: options.http,
        throttle: new HostThrottle(options.requestDelay ?? 2_000, {
          hostDelays: registry.hostDelays(),
          logger,
        }),
        renderer: options.renderer,
      }
    : null;
  const runner = fetcher
    ? new JobRunner({
        db,
        registry,
        fetcher,
        logger,
        maxRetries,
        ...(notify ? { notify } : {}),
      })
    : null;
  const onQueued = () => runner?.wake();
  const prefetcher = createPrefetcher({ db, logger, maxRetries, onQueued });

  const dispatch = createRouter(
    createRoutes({
      db,
      catalog: createCatalogService(db, prefetcher),
      library: createLibraryService(db),
      reader: createReaderService({ db, prefetcher, maxRetries, onQueued }),
      history: createHistoryService(db),
      preferences: createPreferencesService(db),
      imports: createImportService(db, { maxRetries }),
      epubImports: createEpubImportService(db),
      epubExport: createEpubExportService(db),
      fullFetch: createFullFetchService(db, { maxRetries }),
      updates: createUpdateService(db, { maxRetries }),
      management: createNovelManagementService(db),
      accounts: createAccountService(registry, fetcher),
      terms: createTermService(db),
      shelves: createShelfService(db),
    }),
    logger,
  );

  return {
    db,
    async dispatch(request) {
      const response = await dispatch(request);
      // A change may have queued a job (an import, a check, a whole novel): start on it now.
      if (request.method !== 'GET') onQueued();
      return response;
    },
    runner,
    queueStatus: () => queueStatus(db),
    checkList: () => buildCheckList(db),
    backups: {
      write: (path) => writeBackup(db, path),
      inspect: (path) => inspectBackup(db, path),
      summary: () => summarizeLibrary(db),
    },
    async release() {
      await runner?.stop();
      await db.query('PRAGMA wal_checkpoint(TRUNCATE)');
      await db.close();
    },
    async close() {
      await runner?.stop();
      await db.close();
    },
  };
}
