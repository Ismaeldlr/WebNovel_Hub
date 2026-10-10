import { describe, expect, it } from 'vitest';
import { type LibraryFilters, libraryFilterSql } from './library.js';

const NO_FILTERS: LibraryFilters = {
  status: null,
  source: null,
  favorite: null,
  unread: null,
  q: null,
};

describe('libraryFilterSql', () => {
  it('matches everything without filters', () => {
    expect(libraryFilterSql(NO_FILTERS)).toEqual({ where: '1 = 1', values: [] });
  });

  it('adds one condition per filter, numbering the values in order', () => {
    const { where, values } = libraryFilterSql({
      status: 'following',
      source: 'royal_road',
      favorite: false,
      unread: true,
      q: 'Mother  learning',
    });
    expect(values).toEqual(['following', 'royal_road', false, '%mother%', '%learning%']);
    expect(where).toContain('e.status = $1');
    expect(where).toContain('n.source = $2');
    expect(where).toContain('e.is_favorite = $3');
    expect(where).toMatch(/AND EXISTS \(\s*SELECT 1 FROM new_chapters/);
    expect(where).toContain(
      "(n.title_key LIKE $4 ESCAPE '\\' OR n.author_key LIKE $4 ESCAPE '\\')",
    );
    expect(where).toContain(
      "(n.title_key LIKE $5 ESCAPE '\\' OR n.author_key LIKE $5 ESCAPE '\\')",
    );
  });

  it('negates the unread filter for unread=false', () => {
    const { where } = libraryFilterSql({ ...NO_FILTERS, unread: false });
    expect(where).toMatch(/AND NOT EXISTS \(\s*SELECT 1 FROM new_chapters/);
  });

  it('never puts request text into the SQL, only into the values', () => {
    const hostile = "x' OR 1=1; DROP TABLE novels; --";
    const { where, values } = libraryFilterSql({ ...NO_FILTERS, source: hostile, q: hostile });
    expect(where).not.toMatch(/DROP|1=1;/i);
    expect(values).toContain(hostile);
    // LIKE wildcards in a search are escaped, so they match themselves.
    expect(libraryFilterSql({ ...NO_FILTERS, q: '100%_\\' }).values).toEqual(['%100\\%\\_\\\\%']);
  });

  it('uses at most eight distinct words of a search', () => {
    const { values } = libraryFilterSql({ ...NO_FILTERS, q: 'a b c d e f g h i j A a' });
    expect(values).toEqual('abcdefgh'.split('').map((word) => `%${word}%`));
  });
});
