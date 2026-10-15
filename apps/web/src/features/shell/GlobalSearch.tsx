import { SEARCH_LIMITS, type SearchResult } from '@webnovel-hub/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Library, Search, X } from 'lucide-react';
import { type FocusEvent, type KeyboardEvent, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { searchApi } from '../../api/catalog';
import { librarySearchPath } from '../../app/navigation';
import { queryKeys } from '../../app/queryClient';
import { Cover } from '../../components/Cover';
import { IconButton, Spinner } from '../../components/ui';
import { plural } from '../../lib/format';
import { useBackLayer, useDebouncedValue } from '../../lib/hooks';
import styles from './GlobalSearch.module.css';

/** How long the global search waits after the last keystroke (14.1). */
export const GLOBAL_SEARCH_DELAY_MS = 250;

type Option = { kind: 'novel'; result: SearchResult } | { kind: 'all' };

interface GlobalSearchProps {
  /**
   * Phones: the search opens over the top bar. Closes it: the Close button, Escape on an
   * empty box, the phone's back button, and choosing a result call it.
   */
  onClose?: () => void;
}

/**
 * The global search: a combobox with a list of up to five novels (WAI-ARIA
 * combobox pattern, list autocomplete). It asks once the text has two characters, 250 ms
 * after typing stops. ↓ and ↑ move through the results (wrapping), Enter opens the chosen
 * one, or the library filtered by the whole search when none is chosen; Escape closes the
 * list, and a second Escape clears the box. The last option is always "See all results".
 */
export function GlobalSearch({ onClose }: GlobalSearchProps) {
  const navigate = useNavigate();
  const id = useId();
  const inputId = `${id}-input`;
  const listboxId = `${id}-listbox`;
  const optionId = (index: number) => `${id}-option-${index}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  // Whether the list may show: the box has focus and the list wasn't dismissed.
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  useBackLayer(onClose !== undefined, () => onClose?.());

  const typed = text.trim();
  const q = useDebouncedValue(typed, GLOBAL_SEARCH_DELAY_MS);
  const ready = q.length >= SEARCH_LIMITS.minLength;
  const search = useQuery({
    queryKey: queryKeys.search(q),
    queryFn: ({ signal }) => searchApi.search(q, signal),
    enabled: ready,
    // The last results stay while the next ones load, so the list doesn't flicker.
    placeholderData: keepPreviousData,
  });

  const expanded = open && typed.length >= SEARCH_LIMITS.minLength;
  const found = ready ? search.data : undefined;
  const results = found?.results ?? [];
  const options: Option[] = expanded
    ? [...results.map((result): Option => ({ kind: 'novel', result })), { kind: 'all' }]
    : [];
  const activeIndex = active < options.length ? active : -1;

  const close = () => {
    setOpen(false);
    setActive(-1);
  };

  const choose = (option: Option) => {
    const to =
      option.kind === 'novel' ? `/novels/${option.result.novel.id}` : librarySearchPath(typed);
    setText('');
    close();
    void navigate(to);
    onClose?.();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (!expanded) {
          setOpen(true);
          return;
        }
        const count = options.length;
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActive(
          activeIndex === -1 && step < 0 ? count - 1 : (activeIndex + step + count) % count,
        );
        return;
      }
      case 'Enter': {
        if (typed.length < SEARCH_LIMITS.minLength) return;
        event.preventDefault();
        choose(options[activeIndex] ?? { kind: 'all' });
        return;
      }
      case 'Escape': {
        event.preventDefault();
        if (expanded) close();
        else if (text) setText('');
        else onClose?.();
        return;
      }
      case 'Tab':
        close();
        return;
    }
  };

  const onBlur = (event: FocusEvent<HTMLInputElement>) => {
    if (!rootRef.current?.contains(event.relatedTarget)) close();
  };

  const waiting = !found && !search.isError;
  const message = search.isError
    ? search.error.message
    : waiting
      ? 'Searching…'
      : results.length === 0
        ? `No novels match “${q}”.`
        : null;
  const allLabel =
    found && found.total > results.length
      ? `See all ${found.total.toLocaleString()} results in your library`
      : 'See all results in your library';
  // Read out once results arrive for what was typed.
  const announcement =
    expanded && found && !search.isPlaceholderData
      ? results.length === 0
        ? `No novels match “${q}”.`
        : `${plural(results.length, 'result')}${found.total > results.length ? ` of ${found.total.toLocaleString()}` : ''}. Use the up and down arrow keys to choose one.`
      : '';

  return (
    <div
      ref={rootRef}
      className={styles.root}
      role="search"
      data-overlay={onClose ? true : undefined}
    >
      <div className={styles.box}>
        <label htmlFor={inputId} className="visually-hidden">
          Search novels by title or author
        </label>
        <Search className={styles.icon} aria-hidden="true" />
        <input
          id={inputId}
          className={styles.input}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder="Search titles and authors"
          // The phone overlay opens for typing.
          autoFocus={onClose !== undefined}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
        />
        {onClose && (
          <IconButton size="sm" label="Close search" className={styles.close} onClick={onClose}>
            <X aria-hidden="true" />
          </IconButton>
        )}
      </div>

      <div className={styles.popup} hidden={!expanded}>
        {message && (
          <p className={styles.message}>
            {waiting && <Spinner size="sm" decorative />}
            {message}
          </p>
        )}
        <ul id={listboxId} role="listbox" aria-label="Search results" className={styles.options}>
          {options.map((option, index) => (
            <li
              key={option.kind === 'novel' ? option.result.novel.id : 'all'}
              id={optionId(index)}
              role="option"
              aria-selected={index === activeIndex}
              className={option.kind === 'novel' ? styles.option : styles.allOption}
              // Keep focus in the box; the click chooses.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              {option.kind === 'novel' ? (
                <NovelOption result={option.result} />
              ) : (
                <>
                  <Library className={styles.allIcon} aria-hidden="true" />
                  <span>{allLabel}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
      <p className="visually-hidden" role="status">
        {announcement}
      </p>
    </div>
  );
}

function NovelOption({ result }: { result: SearchResult }) {
  const { novel } = result;
  const details = [novel.author, novel.source.name, plural(novel.totalChapters, 'chapter')];
  return (
    <>
      <span className={styles.thumb}>
        <Cover title={novel.title} author={novel.author} coverUrl={novel.coverUrl} size="sm" />
      </span>
      <span className={styles.optionText}>
        <span className={styles.optionTitle}>{novel.title}</span>
        <span className={styles.optionMeta}>{details.filter(Boolean).join(' · ')}</span>
      </span>
    </>
  );
}
