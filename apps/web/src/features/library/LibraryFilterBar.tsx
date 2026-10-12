import { LIBRARY_SORTS, type LibrarySort } from '@webnovel-hub/shared';
import { useQuery } from '@tanstack/react-query';
import { ListFilter, Search, Sparkles, Star, X } from 'lucide-react';
import { useId, useState } from 'react';
import { getSources, libraryApi } from '../../api/catalog';
import { queryKeys } from '../../app/queryClient';
import { Button, Dialog, IconButton, Select } from '../../components/ui';
import { COMPACT_QUERY } from '../../lib/breakpoints';
import { useMediaQuery, useSearchText } from '../../lib/hooks';
import { BarActions } from '../pages/PageHeader';
import styles from './LibraryFilterBar.module.css';
import { type LibraryFilters, SORT_LABELS, isFiltered } from './libraryFilters';

const SORT_CHOICES = LIBRARY_SORTS.map((sort) => ({ value: sort, label: SORT_LABELS[sort] }));

interface LibraryFilterBarProps {
  filters: LibraryFilters;
  onChange: (change: Partial<LibraryFilters>) => void;
  onClear: () => void;
  /** What the list shows, read out when it changes, e.g. "3 of 12 novels match". */
  summary: string;
}

/**
 * The library's filters: title/author search as you type, source, tag and
 * sort, favourites only and unread NEW chapters only; the status is the tabs above (§5.5).
 * Native controls, each with a visible label, so the keyboard and screen readers get them
 * for free. On phones they all move to a sheet that a "Sort & filter" button in the top bar
 * opens; the page keeps the count and "Clear filters".
 */
export function LibraryFilterBar({ filters, onChange, onClear, summary }: LibraryFilterBarProps) {
  const searchId = useId();
  const [search, setSearch] = useSearchText(filters.q, (q) => onChange({ q }));
  const phone = useMediaQuery(COMPACT_QUERY);
  const [sheetOpen, setSheetOpen] = useState(false);
  const filtered = isFiltered(filters);
  const sources = useQuery({
    queryKey: queryKeys.sources,
    queryFn: ({ signal }) => getSources(signal),
    staleTime: 5 * 60_000,
  });
  const sourceChoices = [
    { value: '', label: 'All sources' },
    ...(sources.data ?? []).map((source) => ({ value: source.key, label: source.name })),
  ];
  // A source from the address that the list of sites doesn't name (yet) stays selectable.
  if (filters.source && !sourceChoices.some((choice) => choice.value === filters.source)) {
    sourceChoices.push({ value: filters.source, label: filters.source });
  }
  const tags = useQuery({
    queryKey: queryKeys.libraryTags,
    queryFn: ({ signal }) => libraryApi.tags(signal),
  });
  const tagChoices = [
    { value: '', label: 'All tags' },
    ...(tags.data ?? []).map(({ tag, novels }) => ({ value: tag, label: `${tag} (${novels})` })),
  ];
  // The address may spell the tag in another case than the list does.
  const tagValue =
    tagChoices.find((choice) => choice.value.toLowerCase() === filters.tag?.toLowerCase())?.value ??
    filters.tag;
  if (tagValue && !tagChoices.some((choice) => choice.value === tagValue)) {
    tagChoices.push({ value: tagValue, label: tagValue });
  }

  const searchField = (
    <div className={styles.search} role="search">
      <label htmlFor={searchId} className={styles.label}>
        Search titles and authors
      </label>
      <div className={styles.searchBox}>
        <Search className={styles.searchIcon} aria-hidden="true" />
        <input
          id={searchId}
          type="search"
          className={styles.searchInput}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
    </div>
  );
  const selects = (
    <div className={styles.more}>
      <div className={styles.select}>
        <Select
          label="Source"
          options={sourceChoices}
          value={filters.source ?? ''}
          onChange={(event) => onChange({ source: event.target.value || null })}
        />
      </div>
      {tagChoices.length > 1 && (
        <div className={styles.select}>
          <Select
            label="Tag"
            options={tagChoices}
            value={tagValue ?? ''}
            onChange={(event) => onChange({ tag: event.target.value || null })}
          />
        </div>
      )}
      <div className={`${styles.select} ${styles.sort}`}>
        <Select
          label="Sort by"
          options={SORT_CHOICES}
          value={filters.sort}
          onChange={(event) => onChange({ sort: event.target.value as LibrarySort })}
        />
      </div>
    </div>
  );
  const toggles = (
    <>
      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={filters.favorite}
          onChange={(event) => onChange({ favorite: event.target.checked })}
        />
        <Star className={styles.toggleIcon} aria-hidden="true" />
        Favorites only
      </label>
      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={filters.unread}
          onChange={(event) => onChange({ unread: event.target.checked })}
        />
        <Sparkles className={styles.toggleIcon} aria-hidden="true" />
        With unread new chapters
      </label>
    </>
  );
  const clearButton = filtered && (
    <Button
      size="sm"
      variant="ghost"
      icon={<X aria-hidden="true" />}
      onClick={() => {
        setSearch('');
        onClear();
      }}
    >
      Clear filters
    </Button>
  );

  if (phone) {
    return (
      <section className={styles.bar} aria-label="Filter and sort your library">
        <BarActions>
          <IconButton
            label="Sort & filter"
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            data-active={filtered || undefined}
            className={styles.barButton}
            onClick={() => setSheetOpen(true)}
          >
            <ListFilter aria-hidden="true" />
          </IconButton>
        </BarActions>
        <div className={styles.row}>
          <p className={styles.summary} role="status">
            {summary}
          </p>
          {clearButton}
        </div>
        <Dialog
          open={sheetOpen}
          title="Sort & filter"
          placement="sheet"
          describe={false}
          onCancel={() => setSheetOpen(false)}
        >
          <div className={styles.sheet}>
            {searchField}
            {selects}
            <div className={styles.row}>{toggles}</div>
            {clearButton && <div>{clearButton}</div>}
          </div>
        </Dialog>
      </section>
    );
  }

  return (
    <section className={styles.bar} aria-label="Filter and sort your library">
      <div className={styles.fields}>
        {searchField}
        {selects}
      </div>
      <div className={styles.row}>
        {toggles}
        {clearButton}
        <p className={styles.summary} role="status">
          {summary}
        </p>
      </div>
    </section>
  );
}
