import { ArrowUpToLine, BookOpen, List, Replace, Search, Settings } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link } from 'react-router';
import { useUpClick } from '../../app/back';
import { termsSearchPath } from '../../app/navigation';
import { plural, readingMinutes } from '../../lib/format';
import styles from './ReaderChapterTab.module.css';

/** How far down the chapter the page is scrolled, from 0 to 1. */
function scrolled(): number {
  const room = document.documentElement.scrollHeight - window.innerHeight;
  return room > 0 ? Math.min(1, window.scrollY / room) : 0;
}

interface Props {
  novelId: string;
  novelTitle: string;
  chapter: number;
  totalChapters: number;
  title: string;
  /** Null until the text is stored. */
  wordCount: number | null;
  onChapters: () => void;
  onFind: () => void;
}

/**
 * The reader menu's Chapter tab (phones): where the chapter is in the novel, how long is
 * left of it, and what to do next: the chapter list, find, the novel's terms, its page.
 * The menu closes as any of them acts.
 */
export function ReaderChapterTab({
  novelId,
  novelTitle,
  chapter,
  totalChapters,
  title,
  wordCount,
  onChapters,
  onFind,
}: Props) {
  const upClick = useUpClick();
  // Read when the menu opens: the page doesn't scroll under it.
  const [done] = useState(scrolled);
  const ofNovel = Math.round((chapter / Math.max(1, totalChapters)) * 100);
  const minutesLeft = wordCount === null ? null : Math.ceil(readingMinutes(wordCount) * (1 - done));

  return (
    <>
      <div className={styles.where}>
        <p className={styles.title}>{title}</p>
        <p className={styles.detail}>
          Chapter {chapter.toLocaleString()} of {totalChapters.toLocaleString()} · {ofNovel}% of the
          novel
        </p>
        <div className={styles.meter} aria-hidden="true">
          <span style={{ width: `${ofNovel}%` }} />
        </div>
        {wordCount !== null && minutesLeft !== null && (
          <p className={styles.detail}>
            {done >= 0.98 || minutesLeft === 0
              ? 'At the end of the chapter'
              : `About ${plural(minutesLeft, 'minute')} left in this chapter`}{' '}
            · {plural(wordCount, 'word')}
          </p>
        )}
      </div>
      <ul className={styles.actions}>
        <Action icon={<List />} label="Chapters" onClick={onChapters} />
        <Action icon={<Search />} label="Find" onClick={onFind} />
        <Action
          icon={<ArrowUpToLine />}
          label="Top"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        />
        <li>
          <Link to={termsSearchPath(novelTitle)} className={styles.action}>
            <Replace aria-hidden="true" />
            <span>Terms</span>
          </Link>
        </li>
        <li>
          <Link to={`/novels/${novelId}`} className={styles.action} onClick={upClick}>
            <BookOpen aria-hidden="true" />
            <span>Novel page</span>
          </Link>
        </li>
        <li>
          <Link to="/settings" className={styles.action}>
            <Settings aria-hidden="true" />
            <span>Settings</span>
          </Link>
        </li>
      </ul>
    </>
  );
}

function Action({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <li>
      <button type="button" className={styles.action} onClick={onClick}>
        <span aria-hidden="true">{icon}</span>
        <span>{label}</span>
      </button>
    </li>
  );
}
