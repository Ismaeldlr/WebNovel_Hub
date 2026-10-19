import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { type KeyboardEvent, type RefObject, useEffect, useRef, useState } from 'react';
import { IconButton } from '../../components/ui';
import styles from './FindBar.module.css';

/** The highlight names global.css styles. */
const ALL = 'reader-find';
const CURRENT = 'reader-find-current';

/**
 * Every place `query` appears in the paragraphs under `root`, ignoring case, as ranges.
 * A match may cross the spans that mark terms, never a paragraph's end.
 */
function findRanges(root: Element, query: string): Range[] {
  const ranges: Range[] = [];
  for (const paragraph of root.querySelectorAll('p')) {
    const nodes: { node: Text; start: number }[] = [];
    let text = '';
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      nodes.push({ node: node as Text, start: text.length });
      text += node.nodeValue ?? '';
    }
    // Lower case keeps offsets for nearly every script; where it wouldn't, case counts.
    const lower = text.toLowerCase();
    const caseless = lower.length === text.length;
    const haystack = caseless ? lower : text;
    const needle = caseless ? query.toLowerCase() : query;
    const at = (offset: number, end: boolean) => {
      const found = nodes.findLast((each) => (end ? each.start < offset : each.start <= offset))!;
      return [found.node, offset - found.start] as const;
    };
    for (let index = haystack.indexOf(needle); index !== -1;) {
      const range = document.createRange();
      range.setStart(...at(index, false));
      range.setEnd(...at(index + needle.length, true));
      ranges.push(range);
      index = haystack.indexOf(needle, index + needle.length);
    }
  }
  return ranges;
}

/** Marks the matches, the current one apart; where highlights aren't supported, nothing. */
function paint(ranges: Range[], current: number) {
  if (typeof Highlight === 'undefined' || !('highlights' in CSS)) return;
  const others = ranges.filter((_, index) => index !== current);
  CSS.highlights.set(ALL, new Highlight(...others));
  const shown = ranges[current];
  if (shown) CSS.highlights.set(CURRENT, new Highlight(shown));
  else CSS.highlights.delete(CURRENT);
}

function unpaint() {
  if (typeof Highlight === 'undefined' || !('highlights' in CSS)) return;
  CSS.highlights.delete(ALL);
  CSS.highlights.delete(CURRENT);
}

/** Scrolls the match into the upper third of the screen, unless it is in view already. */
function reveal(range: Range) {
  if (typeof range.getBoundingClientRect !== 'function') return; // jsdom
  const box = range.getBoundingClientRect();
  if (box.top >= 96 && box.bottom <= window.innerHeight - 128) return;
  window.scrollTo({ top: window.scrollY + box.top - window.innerHeight / 3, behavior: 'smooth' });
}

/**
 * Find in this chapter: a field in the reader's bar, the number of matches, and buttons to
 * go through them. Enter goes to the next match, Shift+Enter to the previous one, Escape
 * closes it. Matches are highlighted without changing the text.
 */
export function FindBar({
  rootRef,
  onClose,
}: {
  /** The chapter's text. */
  rootRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [ranges, setRanges] = useState<Range[]>([]);
  const [current, setCurrent] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    paint(ranges, current);
    const shown = ranges[current];
    if (shown) reveal(shown);
  }, [ranges, current]);
  useEffect(() => unpaint, []);

  const search = (text: string) => {
    setQuery(text);
    const root = rootRef.current;
    setRanges(root && text.trim() ? findRanges(root, text.trim()) : []);
    setCurrent(0);
  };
  const move = (step: number) => {
    if (ranges.length > 0) setCurrent((index) => (index + step + ranges.length) % ranges.length);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      move(event.shiftKey ? -1 : 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  const count = !query.trim()
    ? ''
    : ranges.length === 0
      ? 'No matches'
      : `${(current + 1).toLocaleString()} of ${ranges.length.toLocaleString()}`;
  return (
    <div className={styles.bar} role="search">
      <input
        ref={inputRef}
        type="search"
        className={styles.input}
        value={query}
        placeholder="Find in this chapter"
        aria-label="Find in this chapter"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => search(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <span className={styles.count} role="status">
        {count}
      </span>
      <IconButton
        size="sm"
        label="Previous match"
        aria-keyshortcuts="Shift+Enter"
        disabled={ranges.length === 0}
        onClick={() => move(-1)}
      >
        <ChevronUp aria-hidden="true" />
      </IconButton>
      <IconButton
        size="sm"
        label="Next match"
        aria-keyshortcuts="Enter"
        disabled={ranges.length === 0}
        onClick={() => move(1)}
      >
        <ChevronDown aria-hidden="true" />
      </IconButton>
      <IconButton size="sm" label="Close find" aria-keyshortcuts="Escape" onClick={onClose}>
        <X aria-hidden="true" />
      </IconButton>
    </div>
  );
}
