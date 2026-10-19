import {
  type ContentWidth,
  type EditablePreference,
  type NotifyNovels,
  type PreferencesUpdate,
  READER_PREFERENCE_DEFAULTS,
  type ReaderFontFamily,
  type ReaderPreferences,
  type ReaderTextAlign,
  type ThemePreference,
} from '@webnovel-hub/shared';
import type { Queryable } from '../db/database.js';
import { queryValues } from '../db/query-values.js';
import { bool } from '../db/values.js';

/** How many chapters to fetch ahead. */
export async function findPrefetchCount(db: Queryable): Promise<number> {
  const { rows } = await db.query<{ prefetch_count: number }>(
    'SELECT prefetch_count FROM reader_preferences WHERE id = 1',
  );
  return rows[0]?.prefetch_count ?? READER_PREFERENCE_DEFAULTS.prefetchCount;
}

/** How many hours apart the scheduled update checks run. */
export async function findUpdateIntervalHours(db: Queryable): Promise<number> {
  const { rows } = await db.query<{ update_interval_hours: number }>(
    'SELECT update_interval_hours FROM reader_preferences WHERE id = 1',
  );
  return rows[0]?.update_interval_hours ?? READER_PREFERENCE_DEFAULTS.updateIntervalHours;
}

interface PreferencesRow {
  theme: ThemePreference;
  font_size: number;
  font_size_compact: number;
  line_spacing: number;
  content_width: ContentWidth;
  font_family: ReaderFontFamily;
  paragraph_spacing: number;
  text_align: ReaderTextAlign;
  paragraph_indent: number;
  prefetch_count: number;
  update_interval_hours: number;
  background_fetching: number;
  wifi_only: number;
  notify_new_chapters: number;
  notify_novels: NotifyNovels;
  notify_each_novel: number;
  notify_show_titles: number;
  notify_downloads: number;
  notify_problems: number;
  wtr_lab_machine_translation: number;
}

const PREFERENCE_COLUMNS = `theme, font_size, font_size_compact, line_spacing, content_width,
  font_family, paragraph_spacing, text_align, paragraph_indent, prefetch_count, update_interval_hours, background_fetching, wifi_only,
  notify_new_chapters, notify_novels, notify_each_novel, notify_show_titles, notify_downloads,
  notify_problems, wtr_lab_machine_translation`;

function toPreferences(row: PreferencesRow): ReaderPreferences {
  return {
    theme: row.theme,
    fontSize: row.font_size,
    fontSizeCompact: row.font_size_compact,
    lineSpacing: row.line_spacing,
    contentWidth: row.content_width,
    fontFamily: row.font_family,
    paragraphSpacing: row.paragraph_spacing,
    textAlign: row.text_align,
    paragraphIndent: bool(row.paragraph_indent),
    prefetchCount: row.prefetch_count,
    updateIntervalHours: row.update_interval_hours,
    backgroundFetching: bool(row.background_fetching),
    wifiOnly: bool(row.wifi_only),
    notifyNewChapters: bool(row.notify_new_chapters),
    notifyNovels: row.notify_novels,
    notifyEachNovel: bool(row.notify_each_novel),
    notifyShowTitles: bool(row.notify_show_titles),
    notifyDownloads: bool(row.notify_downloads),
    notifyProblems: bool(row.notify_problems),
    wtrLabMachineTranslation: bool(row.wtr_lab_machine_translation),
  };
}

/** The reader preferences, or the defaults if the row is missing. */
export async function findPreferences(db: Queryable): Promise<ReaderPreferences> {
  const { rows } = await db.query<PreferencesRow>(
    `SELECT ${PREFERENCE_COLUMNS} FROM reader_preferences WHERE id = 1`,
  );
  const row = rows[0];
  return row ? toPreferences(row) : { ...READER_PREFERENCE_DEFAULTS };
}

/** The column of each preference the reader can change: the only column names SQL gets. */
const EDITABLE_COLUMNS: Record<EditablePreference, string> = {
  theme: 'theme',
  fontSize: 'font_size',
  fontSizeCompact: 'font_size_compact',
  lineSpacing: 'line_spacing',
  contentWidth: 'content_width',
  fontFamily: 'font_family',
  paragraphSpacing: 'paragraph_spacing',
  textAlign: 'text_align',
  paragraphIndent: 'paragraph_indent',
  prefetchCount: 'prefetch_count',
  backgroundFetching: 'background_fetching',
  wifiOnly: 'wifi_only',
  notifyNewChapters: 'notify_new_chapters',
  notifyNovels: 'notify_novels',
  notifyEachNovel: 'notify_each_novel',
  notifyShowTitles: 'notify_show_titles',
  notifyDownloads: 'notify_downloads',
  notifyProblems: 'notify_problems',
  wtrLabMachineTranslation: 'wtr_lab_machine_translation',
};

/**
 * Saves the given preferences and returns all of them. The others keep their values; a
 * missing row is created with the defaults. The CHECK constraints have the last word.
 */
export async function updatePreferences(
  db: Queryable,
  changes: PreferencesUpdate,
): Promise<ReaderPreferences> {
  const { values, param } = queryValues();
  const columns: string[] = [];
  const placeholders: string[] = [];
  for (const [key, column] of Object.entries(EDITABLE_COLUMNS)) {
    const value = changes[key as EditablePreference];
    if (value === undefined) continue;
    columns.push(column);
    placeholders.push(param(value));
  }
  if (columns.length === 0) return findPreferences(db);

  const { rows } = await db.query<PreferencesRow>(
    `INSERT INTO reader_preferences (id, ${columns.join(', ')})
     VALUES (1, ${placeholders.join(', ')})
     ON CONFLICT (id) DO UPDATE
       SET ${columns.map((column) => `${column} = excluded.${column}`).join(', ')}
     RETURNING ${PREFERENCE_COLUMNS}`,
    values,
  );
  const row = rows[0];
  if (!row) throw new Error('updatePreferences: no row returned');
  return toPreferences(row);
}
