/// <reference types="node" />
// Reads the stylesheets from disk: Vitest doesn't hand raw CSS to import.meta.glob.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPACT_MAX_WIDTH, MEDIUM_MAX_WIDTH } from './breakpoints';

const src = join(import.meta.dirname, '..');
const stylesheets = readdirSync(src, { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.css'))
  .map((file) => ({ file, css: readFileSync(join(src, file), 'utf8') }));

describe('breakpoints', () => {
  it('finds the stylesheets', () => {
    expect(stylesheets.length).toBeGreaterThan(20);
  });

  it('keeps every width media query to the two shared breakpoints', () => {
    const allowed = new Set([`${COMPACT_MAX_WIDTH}px`, `${MEDIUM_MAX_WIDTH}px`]);
    const strays = stylesheets.flatMap(({ file, css }) =>
      [...css.matchAll(/@media[^{]*\((?:max|min)-width:\s*([^)]+)\)/g)]
        .map((match) => (match[1] ?? '').trim())
        .filter((width) => !allowed.has(width))
        .map((width) => `${file}: ${width}`),
    );
    expect(strays).toEqual([]);
  });
});
