import { describe, expect, it } from 'vitest';
import { type Term, applyTerms, termMatcher } from './terms.js';

const novel = { id: 'n1', title: 'A Novel' };
const term = (original: string, replacement: string, forNovel = true) => ({
  novel: forNovel ? novel : null,
  original,
  replacement,
});
const show = (terms: Pick<Term, 'novel' | 'original' | 'replacement'>[], line: string) =>
  applyTerms(line, termMatcher(terms));

describe('termMatcher', () => {
  it('replaces whole words with the same capitals', () => {
    const terms = [term('Lin', 'Lynn')];
    expect(show(terms, 'Lin said to Linda, "Lin!"')).toBe('Lynn said to Linda, "Lynn!"');
    expect(show(terms, 'lin and LIN stay')).toBe('lin and LIN stay');
  });

  it('prefers the longer term, and the novel’s own term over one for every novel', () => {
    const terms = [term('Lin', 'Lynn'), term('Lin Dong', 'Forest Move'), term('Lin', 'L', false)];
    expect(show(terms, 'Lin Dong met Lin.')).toBe('Forest Move met Lynn.');
    expect(show([term('Lin', 'L', false), term('Lin', 'Lynn')], 'Lin')).toBe('Lynn');
  });

  it('never matches a replacement again, and can leave text out', () => {
    expect(show([term('a', 'b'), term('b', 'c')], 'a b')).toBe('b c');
    expect(show([term('[TL note]', '')], 'Text [TL note] here')).toBe('Text  here');
  });

  it('treats special characters as text and matches inside unspaced scripts', () => {
    expect(show([term('Mr. (X)', 'Mister X')], 'Hello Mr. (X).')).toBe('Hello Mister X.');
    expect(show([term('林动', 'Lin Dong')], '他是林动吗')).toBe('他是Lin Dong吗');
  });

  it('marks what it replaced', () => {
    const lin = term('Lin', 'Lynn');
    expect(termMatcher([lin])('Hi Lin!')).toEqual(['Hi ', { term: lin, text: 'Lynn' }, '!']);
    expect(termMatcher([])('Plain')).toEqual(['Plain']);
  });
});
