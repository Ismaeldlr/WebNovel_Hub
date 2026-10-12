-- Terms: text the reader swaps in a novel's chapters as they are shown, such as a machine
-- translation's name for a character. A term without a novel applies to every novel.
CREATE TABLE terms (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-'
    || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-'
    || substr('89ab', 1 + abs(random()) % 4, 1) || substr(lower(hex(randomblob(2))), 2) || '-'
    || lower(hex(randomblob(6)))),
  novel_id    TEXT REFERENCES novels (id) ON DELETE CASCADE,
  original    TEXT NOT NULL,
  replacement TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT terms_original_text CHECK (trim(original) <> '' AND length(original) <= 100),
  CONSTRAINT terms_replacement_text CHECK (length(replacement) <= 100)
);

-- One term per original text in a novel, and one in every novel.
CREATE UNIQUE INDEX terms_novel_original_key ON terms (coalesce(novel_id, ''), original);
CREATE INDEX terms_novel_idx ON terms (novel_id);

CREATE TRIGGER terms_set_updated_at AFTER UPDATE ON terms
  FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE terms SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
