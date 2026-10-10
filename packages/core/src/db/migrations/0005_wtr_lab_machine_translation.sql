-- Whether WTR Lab chapters that need an account for the AI translation are fetched in the
-- site's machine translation instead, while the app isn't signed in.
ALTER TABLE reader_preferences ADD COLUMN wtr_lab_machine_translation INTEGER NOT NULL DEFAULT 0
  CONSTRAINT reader_preferences_wtr_lab_machine_translation_bool
  CHECK (wtr_lab_machine_translation IN (0, 1));
