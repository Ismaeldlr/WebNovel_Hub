-- Whether whole novels download only on Wi-Fi (Android), and whether new chapters found by
-- the scheduled checks are announced with a notification.
ALTER TABLE reader_preferences ADD COLUMN wifi_only INTEGER NOT NULL DEFAULT 0
  CONSTRAINT reader_preferences_wifi_only_bool CHECK (wifi_only IN (0, 1));
ALTER TABLE reader_preferences ADD COLUMN notify_new_chapters INTEGER NOT NULL DEFAULT 1
  CONSTRAINT reader_preferences_notify_new_chapters_bool CHECK (notify_new_chapters IN (0, 1));
