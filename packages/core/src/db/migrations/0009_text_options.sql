-- More ways to set the reading text: the space between paragraphs (in em), justified text,
-- and an indented first line.
ALTER TABLE reader_preferences ADD COLUMN paragraph_spacing REAL NOT NULL DEFAULT 1.1
  CONSTRAINT reader_preferences_paragraph_spacing_range CHECK (paragraph_spacing BETWEEN 0.3 AND 2.5);
ALTER TABLE reader_preferences ADD COLUMN text_align TEXT NOT NULL DEFAULT 'start'
  CONSTRAINT reader_preferences_text_align_valid CHECK (text_align IN ('start', 'justify'));
ALTER TABLE reader_preferences ADD COLUMN paragraph_indent INTEGER NOT NULL DEFAULT 0
  CONSTRAINT reader_preferences_paragraph_indent_bool CHECK (paragraph_indent IN (0, 1));
