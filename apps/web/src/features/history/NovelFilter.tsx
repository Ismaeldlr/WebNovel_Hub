import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useId, useState } from 'react';
import { historyApi } from '../../api/history';
import { queryKeys } from '../../app/queryClient';
import { Popover, usePopoverClose } from '../../components/ui';
import { SEARCH_DELAY_MS, useDebouncedValue } from '../../lib/hooks';
import styles from './HistoryPage.module.css';

/**
 * The chapter view's novel filter, with its own search: a button that opens a
 * panel of the novels in the history, searchable by title or author.
 */
export function NovelFilter({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (novelId: string | null) => void;
}) {
  const labelId = useId();
  // The first page names the selected novel; a search narrows the list.
  const recent = useQuery({
    queryKey: queryKeys.historyNovels(''),
    queryFn: ({ signal }) => historyApi.novels('', signal),
  });
  const selectedTitle =
    selected === null
      ? 'All novels'
      : (recent.data?.find((novel) => novel.id === selected)?.title ?? 'One novel');

  return (
    <div className={styles.novelFilter}>
      <span id={labelId} className={styles.filterLabel}>
        Novel
      </span>
      <Popover
        label="Filter by novel"
        align="start"
        trigger={(props) => (
          <button
            type="button"
            {...props}
            aria-labelledby={`${labelId} ${props.id}`}
            className={styles.filterButton}
          >
            <span className={styles.filterValue}>{selectedTitle}</span>
            <ChevronDown aria-hidden="true" className={styles.filterChevron} />
          </button>
        )}
      >
        <NovelChoices selected={selected} onSelect={onSelect} />
      </Popover>
    </div>
  );
}

function NovelChoices({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (novelId: string | null) => void;
}) {
  const close = usePopoverClose();
  const inputId = useId();
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), SEARCH_DELAY_MS);
  const novels = useQuery({
    queryKey: queryKeys.historyNovels(q),
    queryFn: ({ signal }) => historyApi.novels(q, signal),
    placeholderData: (previous) => previous,
  });

  const choices = [
    ...(q === '' ? [{ id: null, title: 'All novels', author: null as string | null }] : []),
    ...(novels.data ?? []),
  ];
  return (
    <div className={styles.choices}>
      <div className={styles.choiceSearch}>
        <label htmlFor={inputId} className="visually-hidden">
          Search your novels
        </label>
        <Search aria-hidden="true" className={styles.choiceSearchIcon} />
        <input
          id={inputId}
          type="search"
          placeholder="Search your novels"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className={styles.choiceInput}
        />
      </div>
      <ul className={styles.choiceList} aria-busy={novels.isFetching || undefined}>
        {choices.map((novel) => (
          <li key={novel.id ?? 'all'}>
            <button
              type="button"
              className={styles.choice}
              aria-pressed={selected === novel.id}
              onClick={() => {
                onSelect(novel.id);
                close();
              }}
            >
              <Check aria-hidden="true" className={styles.choiceCheck} />
              <span>
                {novel.title}
                {novel.author && <span className={styles.choiceAuthor}> · {novel.author}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {novels.data && choices.length === 0 && (
        <p className={styles.choiceEmpty} role="status">
          No novel in your history matches “{q}”.
        </p>
      )}
    </div>
  );
}
