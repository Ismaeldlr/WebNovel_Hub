import { describe, expect, it } from 'vitest';
import { EPUB_FILE_NAME_MAX, epubFileName } from './exports.js';
import { chapterParagraphs, withoutRepeatedTitle } from './reader.js';

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

describe('withoutRepeatedTitle', () => {
  const text = (first: string) => chapterParagraphs(`${first}\n\nThe story starts.`);

  it('leaves out first lines that only repeat the chapter title', () => {
    const story = [['The story starts.']];
    expect(
      withoutRepeatedTitle(text('Chapter 001\nGood Morning Brother'), '1. Good Morning Brother', 1),
    ).toEqual(story);
    expect(withoutRepeatedTitle(text('Chapter 12: The Pact'), 'Chapter 12 - The Pact', 12)).toEqual(
      story,
    );
    expect(withoutRepeatedTitle(text('Prologue'), 'Prologue', 1)).toEqual(story);
  });

  it('keeps text that is not the title, and never leaves nothing', () => {
    expect(withoutRepeatedTitle(text('Chapter 2'), 'Chapter 1', 1)).toEqual([
      ['Chapter 2'],
      ['The story starts.'],
    ]);
    expect(withoutRepeatedTitle([['The Pact']], 'The Pact', 3)).toEqual([['The Pact']]);
  });
});
