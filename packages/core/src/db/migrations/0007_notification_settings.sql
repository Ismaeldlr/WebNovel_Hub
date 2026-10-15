-- What the reader is told with a notification, besides new chapters (notify_new_chapters):
-- which novels' new chapters (every novel read or followed, or only the ones picked), one
-- notification per novel or one for all, whether titles show, finished downloads, and
-- problems (a check or download that failed).
ALTER TABLE reader_preferences ADD COLUMN notify_novels TEXT NOT NULL DEFAULT 'following'
  CONSTRAINT reader_preferences_notify_novels_valid CHECK (notify_novels IN ('following', 'picked'));
ALTER TABLE reader_preferences ADD COLUMN notify_each_novel INTEGER NOT NULL DEFAULT 0
  CONSTRAINT reader_preferences_notify_each_novel_bool CHECK (notify_each_novel IN (0, 1));
ALTER TABLE reader_preferences ADD COLUMN notify_show_titles INTEGER NOT NULL DEFAULT 1
  CONSTRAINT reader_preferences_notify_show_titles_bool CHECK (notify_show_titles IN (0, 1));
ALTER TABLE reader_preferences ADD COLUMN notify_downloads INTEGER NOT NULL DEFAULT 1
  CONSTRAINT reader_preferences_notify_downloads_bool CHECK (notify_downloads IN (0, 1));
ALTER TABLE reader_preferences ADD COLUMN notify_problems INTEGER NOT NULL DEFAULT 1
  CONSTRAINT reader_preferences_notify_problems_bool CHECK (notify_problems IN (0, 1));

-- A novel's own choice about its new chapters: 1 always tells (and has it checked whatever
-- its status), 0 never does, NULL follows notify_novels.
ALTER TABLE library_entries ADD COLUMN notify INTEGER DEFAULT NULL
  CONSTRAINT library_entries_notify_bool CHECK (notify IN (0, 1));
