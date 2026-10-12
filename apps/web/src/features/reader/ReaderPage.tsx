import {
  type ChapterNotFound,
  READER_PREFERENCE_DEFAULTS,
  type ReaderChapterResponse,
  type ReaderFetching,
  type ReaderNavigation,
  type ReaderNovel,
  type ReaderPreferences,
} from '@webnovel-hub/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BookCheck, BookX, SearchX } from 'lucide-react';
import { type ReactNode, type RefObject, useEffect, useEffectEvent, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { readerApi } from '../../api/catalog';
import { ApiError } from '../../api/client';
import { queryKeys } from '../../app/queryClient';
import {
  ButtonLink,
  EmptyState,
  ErrorState,
  Skeleton,
  SkipLink,
  Spinner,
} from '../../components/ui';
import { COMPACT_QUERY } from '../../lib/breakpoints';
import { plural, readingMinutes } from '../../lib/format';
import { useMediaQuery, usePageTitle } from '../../lib/hooks';
import { readerPath } from '../../lib/reading';
import { readerStyle } from '../preferences/readerStyle';
import { TermSelection } from '../terms/TermSelection';
import { useNovelTerms } from '../terms/termActions';
import { usePreferences } from '../preferences/usePreferences';
import { ChapterNav } from './ChapterNav';
import { ChaptersSheet } from './ChaptersSheet';
import { ChapterText } from './ChapterText';
import { ReaderLibraryControl } from './ReaderLibraryControl';
import { READER_OPTIONS_SELECTOR, ReaderOptionsPanel } from './ReaderOptionsPanel';
import styles from './ReaderPage.module.css';
import { useMarkRead, useRetryFetch } from './readerActions';
import { useBarsHidden, useReadingProgress } from './useReaderBars';

/** How often a chapter being fetched is asked for again. */
export const FETCH_POLL_MS = 1500;

/** A chapter number from the address: a whole number from 1, or null. */
function parseChapter(value: string | undefined): number | null {
  if (value === undefined || !/^\d{1,9}$/.test(value)) return null;
  const number = Number(value);
  return number >= 1 ? number : null;
}

/** Arrow keys belong to whatever the reader is typing in, and to the reading options. */
function ownsArrowKeys(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
    target.closest(READER_OPTIONS_SELECTOR) !== null
  );
}

/**
 * The reader, /reader/:novelId/:chapterNumber: a
 * distraction-free reading column without the app shell.
 */
export function ReaderPage() {
  const { novelId = '', chapterNumber } = useParams();
  const chapter = parseChapter(chapterNumber);
  const preferences = usePreferences().data;
  if (chapter === null) {
    return (
      <ReaderFrame novelId={novelId} preferences={preferences}>
        <EmptyState
          icon={<SearchX aria-hidden="true" />}
          headingLevel={1}
          title="That isn't a chapter number"
          action={
            <ButtonLink to={readerPath(novelId, 1)} variant="primary">
              Open chapter 1
            </ButtonLink>
          }
        >
          <p>Chapters are numbered from 1. Check the address, or start from the beginning.</p>
        </EmptyState>
      </ReaderFrame>
    );
  }
  return <ChapterReader novelId={novelId} chapter={chapter} preferences={preferences} />;
}

interface ChapterReaderProps {
  novelId: string;
  chapter: number;
  /** The reader's preferences, once known (the mirror stands in until the server answers). */
  preferences: ReaderPreferences | undefined;
}

function ChapterReader({ novelId, chapter, preferences }: ChapterReaderProps) {
  const query = useQuery({
    queryKey: queryKeys.reader(novelId, chapter),
    queryFn: ({ signal }) => readerApi.chapter(novelId, chapter, signal),
    // While the worker fetches the text, ask again until it is stored or has failed.
    refetchInterval: (current) =>
      current.state.data?.status === 'fetching' ? FETCH_POLL_MS : false,
  });
  const { data } = query;
  const navigate = useNavigate();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  // Phones get a toolbar at the bottom, and bars that make way while reading (§5.4).
  const phone = useMediaQuery(COMPACT_QUERY);
  const bars = useBarsHidden(phone);
  const progressRef = useReadingProgress();
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const openChapters = () => setChaptersOpen(true);

  // On a phone, a tap on the text shows or hides the bars; never a tap on a control, and
  // never while selecting text.
  const onTap = useEffectEvent((event: MouseEvent) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('a, button, input, select, textarea, label')) return;
    if (window.getSelection()?.toString()) return;
    bars.toggle();
  });
  useEffect(() => {
    const article = articleRef.current;
    if (!phone || !article) return;
    const listener = (event: MouseEvent) => onTap(event);
    article.addEventListener('click', listener);
    return () => article.removeEventListener('click', listener);
  }, [phone]);

  usePageTitle(data ? `${data.chapter.title} · ${data.novel.title}` : `Chapter ${chapter}`);

  // A new chapter starts at the top, with focus on its title, like a new page would.
  // Skipped on the first render, so opening the reader doesn't steal focus.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo(0, 0);
    headingRef.current?.focus({ preventScroll: true });
  }, [novelId, chapter]);

  // One read per chapter shown.
  const { mutate: markRead } = useMarkRead(novelId);
  const marked = useRef<string | null>(null);
  const ready = data?.status === 'ready';
  useEffect(() => {
    const key = `${novelId}/${chapter}`;
    if (!ready || marked.current === key) return;
    marked.current = key;
    markRead(chapter);
  }, [ready, novelId, chapter, markRead]);

  // ← and → turn the page, unless the reader is typing somewhere.
  const navigation: ReaderNavigation | undefined = data?.navigation;
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.shiftKey || ownsArrowKeys(event.target)) return;
    const target =
      event.key === 'ArrowLeft'
        ? navigation?.previous
        : event.key === 'ArrowRight'
          ? navigation?.next
          : undefined;
    if (!target) return;
    event.preventDefault();
    void navigate(readerPath(novelId, target.number));
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, []);

  // Until the preferences arrive, the chapter's copy of them: never the defaults' look.
  const shown = preferences ?? (data?.status === 'ready' ? data.preferences : undefined);

  if (query.isError) {
    return (
      <ReaderFrame novelId={novelId} preferences={preferences}>
        <ReaderError
          error={query.error}
          novelId={novelId}
          chapter={chapter}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </ReaderFrame>
    );
  }

  return (
    <ReaderFrame
      novelId={novelId}
      novelTitle={data?.novel.title}
      position={
        data &&
        `Chapter ${chapter.toLocaleString()} of ${data.novel.totalChapters.toLocaleString()}`
      }
      preferences={preferences}
      control={data && <ReaderLibraryControl novel={data.novel} library={data.library} />}
      barsHidden={bars.hidden}
      onShowBars={bars.show}
      progressRef={progressRef}
      toolbar={
        phone && (
          <ChapterNav
            label="Chapter navigation, toolbar"
            novelId={novelId}
            navigation={navigation}
            onChapters={openChapters}
            variant="toolbar"
          />
        )
      }
    >
      <article
        ref={articleRef}
        className={styles.chapter}
        style={readerStyle(shown ?? READER_PREFERENCE_DEFAULTS)}
        aria-labelledby="chapter-title"
      >
        <header className={styles.chapterHead}>
          <p className={styles.kicker}>
            {data ? (
              <>
                <Link to={`/novels/${novelId}`} className={styles.novelLink}>
                  {data.novel.title}
                </Link>
                <span aria-hidden="true"> · </span>
                <span>
                  Chapter {chapter.toLocaleString()} of {data.novel.totalChapters.toLocaleString()}
                </span>
                {data.status === 'ready' && (
                  <>
                    <span aria-hidden="true"> · </span>
                    <span>
                      {plural(data.wordCount, 'word')} · {readingMinutes(data.wordCount)} min
                    </span>
                  </>
                )}
              </>
            ) : (
              <span>Chapter {chapter.toLocaleString()}</span>
            )}
          </p>
          <h1 id="chapter-title" ref={headingRef} tabIndex={-1} className={styles.title}>
            {data?.chapter.title ?? `Chapter ${chapter}`}
          </h1>
        </header>

        {!phone && (
          <ChapterNav
            label="Chapter navigation"
            novelId={novelId}
            navigation={navigation}
            onChapters={openChapters}
          />
        )}

        <div className={styles.body}>
          <ChapterBody
            novelId={novelId}
            chapter={chapter}
            data={data}
            refreshing={query.isFetching}
          />
        </div>

        {data?.status === 'ready' && !data.navigation.next && (
          <section className={styles.end} aria-labelledby="end-of-novel">
            <BookCheck className={styles.endIcon} aria-hidden="true" />
            <h2 id="end-of-novel" className={styles.endTitle}>
              You're caught up
            </h2>
            <p>
              No further chapters yet. New ones appear here when {data.novel.source.name} publishes
              them and an update check finds them.
            </p>
          </section>
        )}

        <ChapterNav
          label="Chapter navigation, end of chapter"
          novelId={novelId}
          navigation={navigation}
          onChapters={openChapters}
        />
      </article>
      {data && (
        <ChaptersSheet
          key={chapter}
          novelId={novelId}
          totalChapters={data.novel.totalChapters}
          chapter={chapter}
          open={chaptersOpen}
          onClose={() => setChaptersOpen(false)}
        />
      )}
    </ReaderFrame>
  );
}

interface FrameProps {
  novelId: string;
  novelTitle?: string;
  /** Where the chapter is in the novel, under its title in the bar. */
  position?: string | false;
  /** The reader's preferences, for the options panel; undefined until they are known. */
  preferences: ReaderPreferences | undefined;
  /** The library status control, once the chapter is known. */
  control?: ReactNode;
  /** Whether the bars made way for the text (phones), and how to bring them back. */
  barsHidden?: boolean;
  onShowBars?: () => void;
  /** The progress bar's fill, while a chapter shows. */
  progressRef?: RefObject<HTMLSpanElement | null>;
  /** The phone's bottom toolbar. */
  toolbar?: ReactNode;
  children: ReactNode;
}

/**
 * The reader's quiet frame: a way back, the library status, the reading options, and the
 * page. It shows the same theme as every other page.
 */
function ReaderFrame({
  novelId,
  novelTitle,
  position,
  preferences,
  control,
  barsHidden,
  onShowBars,
  progressRef,
  toolbar,
  children,
}: FrameProps) {
  const hidden = barsHidden || undefined;
  return (
    <div className={styles.reader}>
      <SkipLink href="#reader-main">Skip to the chapter</SkipLink>
      {progressRef && (
        <div className={styles.progress} aria-hidden="true">
          <span ref={progressRef} />
        </div>
      )}
      <header className={styles.bar} data-hidden={hidden} onFocus={onShowBars}>
        <div className={styles.barInner}>
          <Link
            to={`/novels/${novelId}`}
            className={styles.back}
            aria-label={`Back to ${novelTitle ?? 'the novel'}`}
          >
            <ArrowLeft aria-hidden="true" />
            <span className={styles.backText}>
              <span className={styles.backTitle}>{novelTitle ?? 'Back to the novel'}</span>
              {position && <span className={styles.backPosition}>{position}</span>}
            </span>
          </Link>
          <div className={styles.barActions}>
            {control}
            <ReaderOptionsPanel preferences={preferences} />
          </div>
        </div>
      </header>
      <main id="reader-main" tabIndex={-1} className={styles.main}>
        {children}
      </main>
      {toolbar && (
        <div className={styles.toolbar} data-hidden={hidden} onFocus={onShowBars}>
          {toolbar}
        </div>
      )}
    </div>
  );
}

/**
 * A stored chapter's text with the novel's terms applied, once they are known (so the
 * names don't change under the reader), and the "Add term" button for selections in it.
 */
function ReadyText({ novel, text }: { novel: ReaderNovel; text: string }) {
  const terms = useNovelTerms(novel.id);
  const textRef = useRef<HTMLDivElement>(null);
  if (terms.isPending) {
    return (
      <div className={styles.text}>
        <Skeleton label="Loading the chapter" />
      </div>
    );
  }
  const list = terms.data ?? [];
  return (
    <>
      <ChapterText ref={textRef} text={text} terms={list} />
      <TermSelection containerRef={textRef} novel={novel} terms={list} />
    </>
  );
}

interface BodyProps {
  novelId: string;
  chapter: number;
  data: ReaderChapterResponse | undefined;
  refreshing: boolean;
}

/** The chapter's text, or what is happening to it. */
function ChapterBody({ novelId, chapter, data, refreshing }: BodyProps) {
  const retry = useRetryFetch(novelId, chapter);

  if (!data) {
    return (
      <div className={styles.text}>
        <Skeleton label="Loading the chapter" />
      </div>
    );
  }
  switch (data.status) {
    case 'ready':
      return <ReadyText novel={data.novel} text={data.content} />;
    case 'fetching':
      return <Fetching chapter={data} />;
    case 'failed':
      return (
        <ErrorState
          title="This chapter couldn't be fetched"
          message={data.error.message}
          onRetry={() => retry.mutate()}
          retrying={retry.isPending || refreshing}
        />
      );
  }
}

/** The text is on its way; the query polls until it arrives. */
function Fetching({ chapter }: { chapter: ReaderFetching }) {
  const { job } = chapter;
  const source = chapter.novel.source.name;

  return (
    <div className={styles.waiting} role="status">
      <Spinner size="lg" decorative />
      <p className={styles.waitingTitle}>Fetching from {source}…</p>
      <p className={styles.waitingDetail}>
        {job.error
          ? `${job.error.message} ${job.progressMessage ?? ''}`.trim()
          : job.status === 'running' && job.progressMessage
            ? job.progressMessage
            : "This chapter isn't stored yet, so it's being downloaded. It will appear here in a moment."}
      </p>
    </div>
  );
}

interface ReaderErrorProps {
  error: Error;
  novelId: string;
  chapter: number;
  onRetry: () => void;
  retrying: boolean;
}

/** Not found (novel or chapter), an invalid chapter, or a request that failed. */
function ReaderError({ error, novelId, chapter, onRetry, retrying }: ReaderErrorProps) {
  if (error instanceof ApiError && error.status === 404) {
    const details = error.data as ChapterNotFound | null;
    if (details && typeof details.totalChapters === 'number') {
      const last = details.totalChapters;
      return (
        <EmptyState
          icon={<BookX aria-hidden="true" />}
          headingLevel={1}
          title={`There's no chapter ${chapter.toLocaleString()}`}
          action={
            <>
              {last > 0 && (
                <ButtonLink to={readerPath(novelId, last)} variant="primary">
                  Open chapter {last.toLocaleString()}
                </ButtonLink>
              )}
              <ButtonLink to={`/novels/${novelId}`}>Back to the novel</ButtonLink>
            </>
          }
        >
          <p>This novel has {plural(last, 'chapter')} so far.</p>
        </EmptyState>
      );
    }
    return (
      <EmptyState
        icon={<SearchX aria-hidden="true" />}
        headingLevel={1}
        title="This novel isn't in your library"
        action={
          <ButtonLink to="/library" variant="primary">
            Back to My Library
          </ButtonLink>
        }
      >
        <p>It may have been removed, or the address may be mistyped.</p>
      </EmptyState>
    );
  }
  if (error instanceof ApiError && error.status === 400) {
    return (
      <EmptyState
        icon={<SearchX aria-hidden="true" />}
        headingLevel={1}
        title="That isn't a chapter number"
        action={
          <ButtonLink to={readerPath(novelId, 1)} variant="primary">
            Open chapter 1
          </ButtonLink>
        }
      >
        <p>{error.message}</p>
      </EmptyState>
    );
  }
  return (
    <ErrorState
      headingLevel={1}
      title="This chapter didn't load"
      message={error.message}
      onRetry={onRetry}
      retrying={retrying}
    />
  );
}
