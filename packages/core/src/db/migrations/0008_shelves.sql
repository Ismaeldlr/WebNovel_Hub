-- Shelves: the reader's own lists of novels, besides the reading status. A novel can be on
-- any number of them; deleting a shelf leaves its novels in the library.
CREATE TABLE shelves (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-'
    || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-'
    || substr('89ab', 1 + abs(random()) % 4, 1) || substr(lower(hex(randomblob(2))), 2) || '-'
    || lower(hex(randomblob(6)))),
  name       TEXT NOT NULL,
  -- Where it shows among the shelves, from 0.
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT shelves_name_text CHECK (trim(name) <> '' AND length(name) <= 40)
);

-- One shelf per name, whatever the case.
CREATE UNIQUE INDEX shelves_name_key ON shelves (name COLLATE NOCASE);

CREATE TABLE shelf_novels (
  shelf_id TEXT NOT NULL REFERENCES shelves (id) ON DELETE CASCADE,
  novel_id TEXT NOT NULL REFERENCES library_entries (novel_id) ON DELETE CASCADE,
  added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (shelf_id, novel_id)
);

CREATE INDEX shelf_novels_novel_idx ON shelf_novels (novel_id);

-- A hidden novel stays in the library (checked, readable, on its shelves) but shows only
-- in the Hidden view, and its new chapters aren't announced unless it asks (notify = 1).
ALTER TABLE library_entries ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0
  CONSTRAINT library_entries_hidden_bool CHECK (hidden IN (0, 1));
