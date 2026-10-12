import {
  type Term,
  chapterParagraphs,
  termMatcher,
  withoutRepeatedTitle,
} from '@webnovel-hub/shared';
import { Fragment, type Ref, useMemo } from 'react';
import styles from './ReaderPage.module.css';

const NO_TERMS: readonly Term[] = [];

interface ChapterTextProps {
  text: string;
  /** Text to show differently; what a term replaced is marked with its id. */
  terms?: readonly Term[];
  /** The chapter's title and number: first lines that only repeat them are left out. */
  title?: string;
  number?: number;
  ref?: Ref<HTMLDivElement>;
}

/**
 * The chapter's text as paragraphs of React text nodes, never as HTML: scraped content
 * can't inject markup.
 */
export function ChapterText({ text, terms = NO_TERMS, title, number, ref }: ChapterTextProps) {
  const match = useMemo(() => termMatcher(terms), [terms]);
  const paragraphs = useMemo(() => {
    const all = chapterParagraphs(text);
    return title === undefined || number === undefined
      ? all
      : withoutRepeatedTitle(all, title, number);
  }, [text, title, number]);
  return (
    <div ref={ref} className={styles.text}>
      {paragraphs.map((lines, index) => (
        <p key={index}>
          {lines.map((line, lineIndex) => (
            <Fragment key={lineIndex}>
              {lineIndex > 0 && <br />}
              {match(line).map((segment, segmentIndex) =>
                typeof segment === 'string' ? (
                  <Fragment key={segmentIndex}>{segment}</Fragment>
                ) : (
                  <span key={segmentIndex} data-term-id={segment.term.id}>
                    {segment.text}
                  </span>
                ),
              )}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}
