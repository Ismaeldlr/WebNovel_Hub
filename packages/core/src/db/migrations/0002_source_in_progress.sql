-- A supported site that doesn't work reliably yet: still importable, but listed apart.
ALTER TABLE source_sites ADD COLUMN in_progress INTEGER NOT NULL DEFAULT 0
  CONSTRAINT source_sites_in_progress_bool CHECK (in_progress IN (0, 1));
