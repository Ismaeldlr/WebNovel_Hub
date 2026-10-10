import { chapterParagraphs } from '@webnovel-hub/shared';
import { Fragment } from 'react';
import styles from './ReaderPage.module.css';

/**
 * The chapter's text as paragraphs of React text nodes, never as HTML: scraped content
 * can't inject markup.
 */
export function ChapterText({ text }: { text: string }) {
  return (
    <div className={styles.text}>
      {chapterParagraphs(text).map((lines, index) => (
        <p key={index}>
          {lines.map((line, lineIndex) => (
            <Fragment key={lineIndex}>
              {lineIndex > 0 && <br />}
              {line}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}
