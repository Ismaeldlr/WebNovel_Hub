import { describe, expect, it } from 'vitest';
import { EPUB_FILE_NAME_MAX, epubFileName } from './exports.js';
import { chapterParagraphs } from './reader.js';

describe('epubFileName', () => {
  it('names the file after the title', () => {
    expect(epubFileName('The Lantern Archive')).toBe('The Lantern Archive.epub');
    expect(epubFileName('Ōkami no Mori — Part 2')).toBe('Ōkami no Mori — Part 2.epub');
  });

  it('leaves out the characters file systems refuse', () => {
    expect(epubFileName('Re:Zero / "Side" Stories?')).toBe('Re Zero Side Stories.epub');
    expect(epubFileName('Tab\tand\nnewline')).toBe('Tab and newline.epub');
    expect(epubFileName('...Hidden?.')).toBe('Hidden.epub');
  });

  it('shortens long titles and names untitled ones', () => {
    const name = epubFileName('A'.repeat(300));
    expect(name).toBe(`${'A'.repeat(EPUB_FILE_NAME_MAX)}.epub`);
    expect(epubFileName(' ?* ')).toBe('Novel.epub');
  });
});

describe('chapterParagraphs', () => {
  it('splits paragraphs on blank lines and keeps line breaks inside them', () => {
    expect(chapterParagraphs('One.\n\nTwo,\nstill two.\r\n\r\n\n  \nThree.\n')).toEqual([
      ['One.'],
      ['Two,', 'still two.'],
      ['Three.'],
    ]);
    expect(chapterParagraphs('')).toEqual([]);
  });
});
