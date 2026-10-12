import type { ReaderNavigation } from '@webnovel-hub/shared';
import { ChevronLeft, ChevronRight, List } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button, ButtonLink } from '../../components/ui';
import { readerPath } from '../../lib/reading';
import styles from './ReaderPage.module.css';

interface ChapterNavProps {
  /** The landmark's name; each bar needs its own. */
  label: string;
  novelId: string;
  /** Undefined while the chapter loads. */
  navigation: ReaderNavigation | undefined;
  /** Opens the chapter list, over the reader. */
  onChapters: () => void;
  /** `bar`: around the chapter. `toolbar`: the phone's bottom bar, smaller. */
  variant?: 'bar' | 'toolbar';
  /** Toolbar: where the chapter is, shown on the Chapters button ("3 / 40"). */
  position?: { chapter: number; total: number } | false;
  /** Toolbar: more controls, before Next (the reading options). */
  children?: ReactNode;
}

/**
 * Previous / chapter list / next. At either end of the novel the
 * control stays in place, disabled, so the bar never shifts and never links nowhere.
 */
export function ChapterNav({
  label,
  novelId,
  navigation,
  onChapters,
  variant = 'bar',
  position,
  children,
}: ChapterNavProps) {
  const previous = navigation?.previous ?? null;
  const next = navigation?.next ?? null;
  const size = variant === 'toolbar' ? 'sm' : undefined;
  return (
    <nav className={styles.nav} data-variant={variant} aria-label={label}>
      {previous ? (
        <ButtonLink
          to={readerPath(novelId, previous.number)}
          rel="prev"
          size={size}
          aria-keyshortcuts="ArrowLeft"
          aria-label={`Previous chapter: ${previous.title}`}
          icon={<ChevronLeft aria-hidden="true" />}
        >
          Previous
        </ButtonLink>
      ) : (
        <Button
          size={size}
          disabled
          icon={<ChevronLeft aria-hidden="true" />}
          title="No previous chapter"
        >
          Previous
        </Button>
      )}
      <Button
        size={size}
        variant="ghost"
        icon={<List aria-hidden="true" />}
        onClick={onChapters}
        aria-label={
          position
            ? `Chapters (chapter ${position.chapter.toLocaleString()} of ${position.total.toLocaleString()})`
            : undefined
        }
      >
        {position
          ? `${position.chapter.toLocaleString()} / ${position.total.toLocaleString()}`
          : 'Chapters'}
      </Button>
      {children}
      {next ? (
        <ButtonLink
          to={readerPath(novelId, next.number)}
          rel="next"
          size={size}
          aria-keyshortcuts="ArrowRight"
          aria-label={`Next chapter: ${next.title}`}
          variant="primary"
          iconEnd={<ChevronRight aria-hidden="true" />}
        >
          Next
        </ButtonLink>
      ) : (
        <Button
          size={size}
          disabled
          iconEnd={<ChevronRight aria-hidden="true" />}
          title="No next chapter yet"
        >
          Next
        </Button>
      )}
    </nav>
  );
}
