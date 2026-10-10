import { useLayoutEffect, useRef, useState } from 'react';
import styles from './NovelPage.module.css';

/**
 * The full description with show more / show less for long text. Paragraphs
 * are text nodes split on blank lines, never HTML.
 */
export function Description({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Only offer "Show more" when the clamped text is actually cut off.
  useLayoutEffect(() => {
    const element = ref.current;
    if (element && !expanded) setOverflows(element.scrollHeight > element.clientHeight + 1);
  }, [text, expanded]);

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  return (
    <div>
      <div
        ref={ref}
        id="novel-description"
        className={styles.description}
        data-expanded={expanded || undefined}
      >
        {paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
      {(overflows || expanded) && (
        <button
          type="button"
          className={styles.more}
          aria-expanded={expanded}
          aria-controls="novel-description"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}
