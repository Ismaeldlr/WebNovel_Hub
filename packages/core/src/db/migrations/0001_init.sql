-- Ids are random UUIDs (version 4), generated here when the code doesn't supply one.
-- Times are ISO-8601 UTC text with milliseconds, so they sort and compare as text.
-- Booleans are 0/1. Lists and objects are JSON text.

CREATE TABLE source_sites (
  key             TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  home_url        TEXT,
  hosts           TEXT NOT NULL DEFAULT '[]',
  importable      INTEGER NOT NULL DEFAULT 1,
  fetch_slowdown  REAL NOT NULL DEFAULT 1,
  last_refused_at TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT source_sites_key_format CHECK (key GLOB '[a-z]*' AND key NOT GLOB '*[^a-z0-9_]*'
    AND length(key) BETWEEN 2 AND 32),
  CONSTRAINT source_sites_name_not_blank CHECK (trim(name) <> ''),
  CONSTRAINT source_sites_home_url_format CHECK (home_url GLOB 'http*://*'),
  CONSTRAINT source_sites_hosts_list CHECK (json_type(hosts) = 'array' AND hosts = lower(hosts)),
  CONSTRAINT source_sites_importable_bool CHECK (importable IN (0, 1)),
  CONSTRAINT source_sites_fetch_slowdown_range CHECK (fetch_slowdown BETWEEN 1 AND 64)
);

INSERT INTO source_sites (key, name, home_url, hosts, importable) VALUES ('epub', 'EPUB', NULL, '[]', 0);

CREATE TABLE novels (
  id                   TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-'
    || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-'
    || substr('89ab', 1 + abs(random()) % 4, 1) || substr(lower(hex(randomblob(2))), 2) || '-'
    || lower(hex(randomblob(6)))),
  source               TEXT NOT NULL REFERENCES source_sites (key) ON UPDATE CASCADE,
  source_url           TEXT NOT NULL,
  title                TEXT NOT NULL,
  author               TEXT,
  -- What searches and title sorting compare: lower case, without accents (see searchKey).
  title_key            TEXT NOT NULL,
  author_key           TEXT NOT NULL,
  description          TEXT,
  tags                 TEXT NOT NULL DEFAULT '[]',
  cover_source_url     TEXT,
  cover_updated_at     TEXT, -- when the stored cover last changed; NULL without one
  total_chapters       INTEGER NOT NULL DEFAULT 0,
  update_failed        INTEGER NOT NULL DEFAULT 0,
  update_error_type    TEXT,
  update_error_message TEXT,
  last_checked_at      TEXT, -- latest update-check attempt
  last_scraped_at      TEXT, -- latest successful fetch of metadata and chapter list
  latest_chapter_at    TEXT, -- publication (or discovery) time of the newest chapter
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT novels_source_url_key UNIQUE (source_url),
  CONSTRAINT novels_source_url_format CHECK (
    CASE WHEN source = 'epub'
      THEN source_url GLOB 'epub:sha256:*' AND length(source_url) = 76
        AND substr(source_url, 13) NOT GLOB '*[^0-9a-f]*'
      ELSE source_url GLOB 'http*://*'
    END
  ),
  CONSTRAINT novels_title_not_blank CHECK (trim(title) <> ''),
  CONSTRAINT novels_tags_list CHECK (json_type(tags) = 'array'),
  CONSTRAINT novels_total_chapters_non_negative CHECK (total_chapters >= 0),
  CONSTRAINT novels_update_error_type_valid CHECK (update_error_type IN
    ('network_error', 'structure_changed', 'rate_limited', 'unknown')),
  CONSTRAINT novels_update_error_consistent CHECK (
    (update_failed = 1 AND update_error_type IS NOT NULL AND update_error_message IS NOT NULL)
    OR (update_failed = 0 AND update_error_type IS NULL AND update_error_message IS NULL)
  )
);

CREATE INDEX novels_source_idx ON novels (source);
CREATE INDEX novels_title_key_idx ON novels (title_key);

CREATE TABLE covers (
  novel_id   TEXT PRIMARY KEY REFERENCES novels (id) ON DELETE CASCADE,
  media_type TEXT NOT NULL,
  bytes      BLOB NOT NULL,
  CONSTRAINT covers_media_type_valid CHECK (media_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif'))
);

CREATE TABLE chapters (
  id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-'
    || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-'
    || substr('89ab', 1 + abs(random()) % 4, 1) || substr(lower(hex(randomblob(2))), 2) || '-'
    || lower(hex(randomblob(6)))),
  novel_id            TEXT NOT NULL REFERENCES novels (id) ON DELETE CASCADE,
  number              INTEGER NOT NULL,
  title               TEXT NOT NULL,
  source_url          TEXT, -- NULL for EPUB chapters
  is_fetched          INTEGER NOT NULL DEFAULT 0,
  fetch_error_type    TEXT,
  fetch_error_message TEXT,
  published_at        TEXT,
  discovered_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  fetched_at          TEXT,
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT chapters_novel_number_key UNIQUE (novel_id, number),
  CONSTRAINT chapters_novel_source_url_key UNIQUE (novel_id, source_url),
  CONSTRAINT chapters_novel_id_id_key UNIQUE (novel_id, id),
  CONSTRAINT chapters_number_positive CHECK (number >= 1),
  CONSTRAINT chapters_fetched_consistent CHECK (is_fetched = (fetched_at IS NOT NULL)),
  CONSTRAINT chapters_fetch_error_type_valid CHECK (fetch_error_type IN
    ('network_error', 'structure_changed', 'rate_limited', 'unknown')),
  CONSTRAINT chapters_fetch_error_consistent CHECK (
    (fetch_error_type IS NULL) = (fetch_error_message IS NULL)
    AND NOT (is_fetched = 1 AND fetch_error_type IS NOT NULL)
  )
);

CREATE TABLE chapter_contents (
  chapter_id TEXT PRIMARY KEY REFERENCES chapters (id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  word_count INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT chapter_contents_word_count_non_negative CHECK (word_count >= 0)
);

-- One entry per novel: every novel on the device is in the library.
CREATE TABLE library_entries (
  novel_id                 TEXT PRIMARY KEY REFERENCES novels (id) ON DELETE CASCADE,
  status                   TEXT NOT NULL DEFAULT 'reading',
  is_favorite              INTEGER NOT NULL DEFAULT 0,
  last_read_chapter_number INTEGER,
  furthest_chapter_number  INTEGER,
  added_at                 TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_read_at             TEXT,
  updated_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT library_entries_status_valid CHECK (status IN
    ('reading', 'following', 'on_hold', 'dropped', 'completed')),
  CONSTRAINT library_entries_progress_valid CHECK (
    (last_read_chapter_number IS NULL AND furthest_chapter_number IS NULL AND last_read_at IS NULL)
    OR (
      last_read_chapter_number >= 1
      AND furthest_chapter_number >= last_read_chapter_number
      AND last_read_at IS NOT NULL
    )
  )
);

CREATE TABLE reading_history (
  id         INTEGER PRIMARY KEY,
  novel_id   TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  read_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  read_day   TEXT NOT NULL, -- the reader's local date when they read it (YYYY-MM-DD)
  CONSTRAINT reading_history_chapter_fkey FOREIGN KEY (novel_id, chapter_id)
    REFERENCES chapters (novel_id, id) ON DELETE CASCADE
);

CREATE INDEX reading_history_read_at_idx ON reading_history (read_at DESC);
CREATE INDEX reading_history_read_day_idx ON reading_history (read_day);
CREATE INDEX reading_history_novel_chapter_idx ON reading_history (novel_id, chapter_id);

-- Chapters found by an update check that the reader hasn't opened yet.
CREATE TABLE new_chapters (
  chapter_id TEXT PRIMARY KEY,
  novel_id   TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  seen_at    TEXT,
  CONSTRAINT new_chapters_chapter_fkey FOREIGN KEY (novel_id, chapter_id)
    REFERENCES chapters (novel_id, id) ON DELETE CASCADE
);

CREATE INDEX new_chapters_novel_chapter_idx ON new_chapters (novel_id, chapter_id);
CREATE INDEX new_chapters_unseen_idx ON new_chapters (novel_id) WHERE seen_at IS NULL;

-- One row: the reader's settings.
CREATE TABLE reader_preferences (
  id                    INTEGER PRIMARY KEY CHECK (id = 1),
  theme                 TEXT NOT NULL DEFAULT 'system',
  font_size             INTEGER NOT NULL DEFAULT 18,
  font_size_compact     INTEGER NOT NULL DEFAULT 16,
  line_spacing          REAL NOT NULL DEFAULT 1.6,
  content_width         TEXT NOT NULL DEFAULT 'medium',
  font_family           TEXT NOT NULL DEFAULT 'serif',
  prefetch_count        INTEGER NOT NULL DEFAULT 3,
  update_interval_hours INTEGER NOT NULL DEFAULT 6,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT reader_preferences_theme_valid CHECK (theme IN
    ('system', 'light', 'dark', 'sepia', 'black')),
  CONSTRAINT reader_preferences_font_size_range CHECK (font_size BETWEEN 14 AND 28),
  CONSTRAINT reader_preferences_font_size_compact_range CHECK (font_size_compact BETWEEN 14 AND 28),
  CONSTRAINT reader_preferences_line_spacing_range CHECK (line_spacing BETWEEN 1.4 AND 2.2),
  CONSTRAINT reader_preferences_content_width_valid CHECK (content_width IN
    ('narrow', 'medium', 'wide')),
  CONSTRAINT reader_preferences_font_family_allowed
    CHECK (font_family IN ('serif', 'sans', 'hyperlegible', 'system')),
  CONSTRAINT reader_preferences_prefetch_count_range CHECK (prefetch_count BETWEEN 0 AND 10),
  CONSTRAINT reader_preferences_update_interval_range CHECK (update_interval_hours BETWEEN 1 AND 168)
);

INSERT INTO reader_preferences (id) VALUES (1);

CREATE TABLE update_job_runs (
  id                 TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-'
    || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-'
    || substr('89ab', 1 + abs(random()) % 4, 1) || substr(lower(hex(randomblob(2))), 2) || '-'
    || lower(hex(randomblob(6)))),
  trigger            TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending',
  novel_id           TEXT REFERENCES novels (id) ON DELETE CASCADE,
  novels_checked     INTEGER NOT NULL DEFAULT 0,
  new_chapters_found INTEGER NOT NULL DEFAULT 0,
  errors             TEXT NOT NULL DEFAULT '[]',
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  started_at         TEXT,
  finished_at        TEXT,
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT update_job_runs_status_valid CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  CONSTRAINT update_job_runs_target_matches_trigger CHECK (
    CASE trigger
      WHEN 'manual' THEN novel_id IS NOT NULL
      WHEN 'scheduled' THEN novel_id IS NULL
      ELSE 0
    END
  ),
  CONSTRAINT update_job_runs_counts_non_negative
    CHECK (novels_checked >= 0 AND new_chapters_found >= 0),
  CONSTRAINT update_job_runs_errors_is_array CHECK (json_type(errors) = 'array'),
  CONSTRAINT update_job_runs_finished_consistent
    CHECK ((status IN ('completed', 'failed')) = (finished_at IS NOT NULL))
);

CREATE INDEX update_job_runs_created_at_idx ON update_job_runs (created_at DESC);
CREATE INDEX update_job_runs_novel_id_idx ON update_job_runs (novel_id);

CREATE TABLE scrape_jobs (
  id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-'
    || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-'
    || substr('89ab', 1 + abs(random()) % 4, 1) || substr(lower(hex(randomblob(2))), 2) || '-'
    || lower(hex(randomblob(6)))),
  type             TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending',
  priority         INTEGER NOT NULL DEFAULT 5,
  available_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  dedupe_key       TEXT,
  novel_id         TEXT REFERENCES novels (id) ON DELETE CASCADE,
  chapter_id       TEXT,
  update_run_id    TEXT REFERENCES update_job_runs (id) ON DELETE CASCADE,
  payload          TEXT NOT NULL DEFAULT '{}',
  result           TEXT,
  retry_count      INTEGER NOT NULL DEFAULT 0,
  max_retries      INTEGER NOT NULL DEFAULT 3,
  progress_message TEXT, -- shown to the reader
  progress_percent INTEGER,
  error_type       TEXT,
  error_message    TEXT, -- shown to the reader
  error_detail     TEXT, -- diagnostics only
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  started_at       TEXT, -- first start; kept across retries
  finished_at      TEXT,
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT scrape_jobs_chapter_fkey FOREIGN KEY (novel_id, chapter_id)
    REFERENCES chapters (novel_id, id) ON DELETE CASCADE,
  CONSTRAINT scrape_jobs_type_valid CHECK (type IN ('novel_ingestion', 'chapter_fetch',
    'update_check', 'manual_update_check', 'novel_fetch_all')),
  CONSTRAINT scrape_jobs_status_valid CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  CONSTRAINT scrape_jobs_error_type_valid CHECK (error_type IN
    ('network_error', 'structure_changed', 'rate_limited', 'unknown')),
  CONSTRAINT scrape_jobs_refs_match_type CHECK (
    CASE type
      WHEN 'novel_ingestion' THEN chapter_id IS NULL AND update_run_id IS NULL
      WHEN 'chapter_fetch' THEN
        novel_id IS NOT NULL AND chapter_id IS NOT NULL AND update_run_id IS NULL
      WHEN 'update_check' THEN
        update_run_id IS NOT NULL AND novel_id IS NULL AND chapter_id IS NULL
      WHEN 'manual_update_check' THEN
        novel_id IS NOT NULL AND update_run_id IS NOT NULL AND chapter_id IS NULL
      WHEN 'novel_fetch_all' THEN
        novel_id IS NOT NULL AND chapter_id IS NULL AND update_run_id IS NULL
        AND json_type(payload, '$.source') = 'text'
      ELSE 0
    END
  ),
  CONSTRAINT scrape_jobs_payload_object CHECK (json_type(payload) = 'object'),
  CONSTRAINT scrape_jobs_priority_range CHECK (priority BETWEEN 0 AND 9),
  CONSTRAINT scrape_jobs_retries_valid CHECK (max_retries >= 0 AND retry_count BETWEEN 0 AND max_retries),
  CONSTRAINT scrape_jobs_progress_percent_range CHECK (progress_percent BETWEEN 0 AND 100),
  CONSTRAINT scrape_jobs_running_started CHECK (status <> 'running' OR started_at IS NOT NULL),
  CONSTRAINT scrape_jobs_finished_consistent
    CHECK ((status IN ('completed', 'failed')) = (finished_at IS NOT NULL)),
  CONSTRAINT scrape_jobs_failed_has_error
    CHECK (status <> 'failed' OR (error_type IS NOT NULL AND error_message IS NOT NULL))
);

CREATE UNIQUE INDEX scrape_jobs_active_dedupe_key_idx ON scrape_jobs (dedupe_key)
  WHERE status IN ('pending', 'running');
CREATE UNIQUE INDEX scrape_jobs_one_fetch_all_per_source_idx
  ON scrape_jobs (json_extract(payload, '$.source'))
  WHERE type = 'novel_fetch_all' AND status = 'running';
CREATE INDEX scrape_jobs_queue_idx ON scrape_jobs (priority, created_at) WHERE status = 'pending';
CREATE INDEX scrape_jobs_created_at_idx ON scrape_jobs (created_at DESC);
CREATE INDEX scrape_jobs_novel_chapter_idx ON scrape_jobs (novel_id, chapter_id);
CREATE INDEX scrape_jobs_update_run_id_idx ON scrape_jobs (update_run_id);

-- An update run shows the status of the job that carries it out.
CREATE TRIGGER scrape_jobs_mirror_update_run_insert AFTER INSERT ON scrape_jobs
  FOR EACH ROW WHEN NEW.update_run_id IS NOT NULL
BEGIN
  UPDATE update_job_runs
  SET status = NEW.status, started_at = coalesce(started_at, NEW.started_at),
      finished_at = NEW.finished_at
  WHERE id = NEW.update_run_id;
END;

CREATE TRIGGER scrape_jobs_mirror_update_run_update
  AFTER UPDATE OF status, started_at, finished_at ON scrape_jobs
  FOR EACH ROW WHEN NEW.update_run_id IS NOT NULL
BEGIN
  UPDATE update_job_runs
  SET status = NEW.status, started_at = coalesce(started_at, NEW.started_at),
      finished_at = NEW.finished_at
  WHERE id = NEW.update_run_id;
END;

-- updated_at follows every change unless the statement sets it itself.
CREATE TRIGGER source_sites_set_updated_at AFTER UPDATE ON source_sites
  FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE source_sites SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE key = NEW.key;
END;

CREATE TRIGGER novels_set_updated_at AFTER UPDATE ON novels
  FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE novels SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER chapters_set_updated_at AFTER UPDATE ON chapters
  FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE chapters SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER chapter_contents_set_updated_at AFTER UPDATE ON chapter_contents
  FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE chapter_contents SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE chapter_id = NEW.chapter_id;
END;

CREATE TRIGGER library_entries_set_updated_at AFTER UPDATE ON library_entries
  FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE library_entries SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE novel_id = NEW.novel_id;
END;

CREATE TRIGGER reader_preferences_set_updated_at AFTER UPDATE ON reader_preferences
  FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE reader_preferences SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1;
END;

CREATE TRIGGER update_job_runs_set_updated_at AFTER UPDATE ON update_job_runs
  FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE update_job_runs SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER scrape_jobs_set_updated_at AFTER UPDATE ON scrape_jobs
  FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE scrape_jobs SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
