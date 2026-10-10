import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  countWords,
  expandSelfClosingTags,
  htmlToText,
  plainTextToParagraphs,
  splitHtml,
} from './normalize.js';

// The fixtures live only on the development machine, so the cases are skipped without them.
const FIXTURES = fileURLToPath(new URL('../../../../fixtures/normalization/', import.meta.url));
const cases = existsSync(FIXTURES)
  ? readdirSync(FIXTURES)
      .filter((name) => name.endsWith('.html'))
      .map((name) => name.slice(0, -'.html'.length))
  : [];

describe.skipIf(cases.length === 0)('the shared normalization fixtures', () => {
  it.each(cases)('%s', (name) => {
    const html = readFileSync(`${FIXTURES}${name}.html`, 'utf8');
    // Each .txt ends with one newline that isn't part of the expected text.
    const expected = readFileSync(`${FIXTURES}${name}.txt`, 'utf8').replace(/\n$/, '');
    expect(htmlToText(html)).toBe(expected);
  });
});

describe('htmlToText', () => {
  it('keeps paragraphs and line breaks and drops chrome', () => {
    const html = `<body><h1>Title</h1><p>One&nbsp; two<br>three</p>
      <nav>Next</nav><div class="Ads">Buy</div><p hidden>secret</p><p>Fo\xADur<b>s</b></p></body>`;
    expect(htmlToText(html)).toBe('Title\n\nOne two\nthree\n\nFours');
  });

  it('counts words like the scraper: whitespace-separated tokens', () => {
    expect(countWords('One two\nthree\n\n“Four,” five\xA0six')).toBe(6);
    expect(countWords('')).toBe(0);
  });
});

describe('expandSelfClosingTags', () => {
  it('closes self-closed XHTML elements so the HTML parser keeps the text', () => {
    const xhtml = `<html><head><title/><script src="x.js"/></head>
      <body><div class="spacer"/><p>Kept<a id="p12"/> text<br/></p><p/><img src="a.png"/></body></html>`;
    expect(expandSelfClosingTags(xhtml)).toContain('<title></title><script src="x.js"></script>');
    expect(htmlToText(expandSelfClosingTags(xhtml))).toBe('Kept text');
    // Without it, the empty <title/> swallows the rest of the document.
    expect(htmlToText(xhtml)).toBe('');
  });
});

describe('splitHtml', () => {
  const html = `<body><p>Before</p>
    <h2><a id="c1"></a>Chapter One</h2><p>First text</p>
    <div id="c2"><h2>Chapter <i>Two</i></h2><p>Second text</p></div>
    <p id="missing-is-ignored">Still two</p></body>`;

  it('splits at the anchors it is given, in document order', () => {
    const { before, sections } = splitHtml(html, new Set(['c2', 'c1', 'nowhere']));
    expect(before.text).toBe('Before');
    expect(sections.map((section) => section.id)).toEqual(['c1', 'c2']);
    expect(sections[0]?.segment).toEqual({
      text: 'Chapter One\n\nFirst text',
      heading: null, // the split point sits inside the heading
      startsWithHeading: true,
    });
    expect(sections[1]?.segment).toEqual({
      text: 'Chapter Two\n\nSecond text\n\nStill two',
      heading: 'Chapter Two',
      startsWithHeading: true,
    });
  });

  it('without split points, reports the first heading and whether the text starts with it', () => {
    expect(splitHtml(html).before).toMatchObject({
      heading: 'Chapter One',
      startsWithHeading: false,
    });
    expect(splitHtml('<p>Just text</p>').before).toEqual({
      text: 'Just text',
      heading: null,
      startsWithHeading: false,
    });
  });
});

describe('plainTextToParagraphs', () => {
  it('keeps blank-line paragraphs of plain text and joins wrapped lines', () => {
    expect(plainTextToParagraphs('  A  quiet\r\nstart.\r\n \r\n\n  Then more.  \n')).toBe(
      'A quiet start.\n\nThen more.',
    );
  });
});
