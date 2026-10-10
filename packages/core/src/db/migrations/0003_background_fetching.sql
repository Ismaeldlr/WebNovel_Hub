-- Whether fetching goes on after the window is closed (Windows: in the tray).
ALTER TABLE reader_preferences ADD COLUMN background_fetching INTEGER NOT NULL DEFAULT 0
  CONSTRAINT reader_preferences_background_fetching_bool CHECK (background_fetching IN (0, 1));
