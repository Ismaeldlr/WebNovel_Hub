/**
 * Terms: text the reader swaps in a novel's chapters as they are shown, such as a machine
 * translation's name for a character. The stored chapter text never changes.
 */

/** The longest original text or replacement a term can have, in characters. */
export const TERM_TEXT_MAX = 100;

/** A term, for one novel or (`novel` null) for every novel. */
export interface Term {
  id: string;
  novel: { id: string; title: string } | null;
  /** The text as the chapters have it. */
  original: string;
  /** What the reader sees instead; empty to leave the text out. */
  replacement: string;
  createdAt: string;
  updatedAt: string;
}

/** Body of POST /terms. */
export interface TermCreate {
  /** The novel it belongs to; null for every novel. */
  novelId: string | null;
  original: string;
  replacement: string;
}

/** Body of PATCH /terms/:id: any of the fields. */
export type TermUpdate = Partial<TermCreate>;

/** Response of GET /terms (every term) and GET /novels/:id/terms (those a novel uses). */
export interface TermsResponse {
  terms: Term[];
}

/** Response of POST /terms (201) and PATCH /terms/:id. */
export interface TermResponse {
  term: Term;
}

/** A piece of a line: text as it is, or text a term replaced. */
export type TermSegment<T> = string | { term: T; text: string };

// Letters, digits and the underscore are part of a word, except in scripts written without
// spaces, where a term can start or end anywhere.
const WORD_CHAR = /[\p{L}\p{N}_]/u;
const UNSPACED_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const NOT_AFTER_WORD = '(?<![\\p{L}\\p{N}_])';
const NOT_BEFORE_WORD = '(?![\\p{L}\\p{N}_])';

const needsBoundary = (char: string | undefined) =>
  char !== undefined && WORD_CHAR.test(char) && !UNSPACED_CHAR.test(char);

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A function that splits a line into what stays and what the terms replace. Terms match
 * whole words with the same capitals; where two overlap the longer one wins, and a novel's
 * own term wins over one for every novel with the same original. Replacements are never
 * matched again.
 */
export function termMatcher<T extends Pick<Term, 'novel' | 'original' | 'replacement'>>(
  terms: readonly T[],
): (line: string) => TermSegment<T>[] {
  const byOriginal = new Map<string, T>();
  for (const term of terms) {
    const known = byOriginal.get(term.original);
    if (term.original !== '' && (!known || (known.novel === null && term.novel !== null))) {
      byOriginal.set(term.original, term);
    }
  }
  if (byOriginal.size === 0) return (line) => (line === '' ? [] : [line]);

  const originals = [...byOriginal.keys()].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(
    originals
      .map((original) => {
        const chars = [...original];
        return (
          (needsBoundary(chars[0]) ? NOT_AFTER_WORD : '') +
          escapeRegExp(original) +
          (needsBoundary(chars.at(-1)) ? NOT_BEFORE_WORD : '')
        );
      })
      .join('|'),
    'gu',
  );

  return (line) => {
    const segments: TermSegment<T>[] = [];
    let at = 0;
    for (const match of line.matchAll(pattern)) {
      const term = byOriginal.get(match[0]);
      if (!term) continue;
      if (match.index > at) segments.push(line.slice(at, match.index));
      segments.push({ term, text: term.replacement });
      at = match.index + match[0].length;
    }
    if (at < line.length) segments.push(line.slice(at));
    return segments;
  };
}

/** A line with the terms applied, as plain text. */
export function applyTerms<T extends Pick<Term, 'novel' | 'original' | 'replacement'>>(
  line: string,
  match: (line: string) => TermSegment<T>[],
): string {
  return match(line)
    .map((segment) => (typeof segment === 'string' ? segment : segment.text))
    .join('');
}
