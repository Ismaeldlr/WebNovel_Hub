import type { Term } from '@webnovel-hub/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Pencil, Plus, Replace, Search } from 'lucide-react';
import { useId, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { termsApi } from '../../api/terms';
import { queryKeys } from '../../app/queryClient';
import {
  Button,
  ButtonLink,
  EmptyState,
  ErrorState,
  IconButton,
  Spinner,
} from '../../components/ui';
import { plural } from '../../lib/format';
import { usePageBar } from '../../lib/hooks';
import { PageHeader } from '../pages/PageHeader';
import styles from './TermsPage.module.css';
import { TermDialog } from './TermDialog';

interface Group {
  key: string;
  novel: Term['novel'];
  terms: Term[];
}

/** The terms in the API's order (every novel first, then by novel), one group per novel. */
function groupByNovel(terms: readonly Term[]): Group[] {
  const groups: Group[] = [];
  for (const term of terms) {
    const key = term.novel?.id ?? '';
    const last = groups.at(-1);
    if (last && last.key === key) last.terms.push(term);
    else groups.push({ key, novel: term.novel, terms: [term] });
  }
  return groups;
}

const matches = (term: Term, text: string) =>
  [term.original, term.replacement, term.novel?.title ?? 'Every novel'].some((field) =>
    field.toLowerCase().includes(text),
  );

/**
 * /profile/terms: every term, by novel, to search, change or delete; new ones for every
 * novel can be added here (a novel's own come from selecting its text in the reader).
 */
export function TermsPage() {
  const terms = useQuery({
    queryKey: queryKeys.terms,
    queryFn: ({ signal }) => termsApi.list(signal),
  });
  const searchId = useId();
  // Opened from the reader: that novel's terms (`?q=` its title).
  const [params] = useSearchParams();
  const [search, setSearch] = useState(() => params.get('q') ?? '');
  // `null` adds a term for every novel.
  const [editing, setEditing] = useState<Term | null | undefined>(undefined);

  const text = search.trim().toLowerCase();
  const shown = (terms.data ?? []).filter((term) => text === '' || matches(term, text));

  // Phones: back to Profile (or the chapter it was opened from) from the top bar.
  usePageBar({ back: true });
  return (
    <>
      <PageHeader
        title="Terms"
        lead="Text the reader shows differently, such as names a machine translation got wrong. Select a few words in a chapter to add one."
        actions={
          <>
            <ButtonLink to="/profile" variant="ghost" icon={<ArrowLeft aria-hidden="true" />}>
              Profile
            </ButtonLink>
            <Button
              variant="primary"
              icon={<Plus aria-hidden="true" />}
              onClick={() => setEditing(null)}
            >
              Add term
            </Button>
          </>
        }
        barActions={
          <IconButton label="Add term" onClick={() => setEditing(null)}>
            <Plus aria-hidden="true" />
          </IconButton>
        }
      />
      <div className={styles.page}>
        {terms.isPending ? (
          <div className={styles.loading}>
            <Spinner size="lg" label="Loading your terms" />
          </div>
        ) : terms.isError ? (
          <ErrorState
            title="Your terms didn't load"
            message={terms.error.message}
            onRetry={() => void terms.refetch()}
            retrying={terms.isFetching}
          />
        ) : terms.data.length === 0 ? (
          <EmptyState icon={<Replace aria-hidden="true" />} title="No terms yet">
            <p>
              In the reader, select a name or a few words and choose <strong>Add term</strong> to
              show something else in their place, in that novel or in every novel.
            </p>
          </EmptyState>
        ) : (
          <>
            <div className={styles.search} role="search">
              <label htmlFor={searchId} className={styles.searchLabel}>
                Search terms
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
              <p className={styles.count} role="status">
                {text === ''
                  ? plural(terms.data.length, 'term')
                  : `${shown.length.toLocaleString()} of ${plural(terms.data.length, 'term')}`}
              </p>
            </div>
            {shown.length === 0 ? (
              <p className={styles.none}>No terms match “{search.trim()}”.</p>
            ) : (
              groupByNovel(shown).map((group) => (
                <TermGroup key={group.key} group={group} onEdit={setEditing} />
              ))
            )}
          </>
        )}
      </div>
      <TermDialog
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        term={editing ?? null}
        novel={null}
      />
    </>
  );
}

function TermGroup({ group, onEdit }: { group: Group; onEdit: (term: Term) => void }) {
  const headingId = useId();
  return (
    <section className={styles.group} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.groupTitle}>
        {group.novel ? (
          <Link to={`/novels/${group.novel.id}`}>{group.novel.title}</Link>
        ) : (
          'Every novel'
        )}
      </h2>
      <ul className={styles.list}>
        {group.terms.map((term) => (
          <li key={term.id} className={styles.row}>
            <span className={styles.original}>{term.original}</span>
            <ArrowRight className={styles.arrow} aria-hidden="true" />
            <span className="visually-hidden">becomes</span>
            <span className={styles.replacement}>
              {term.replacement || <em className={styles.hidden}>Hidden</em>}
            </span>
            <Button
              size="sm"
              variant="ghost"
              icon={<Pencil aria-hidden="true" />}
              aria-label={`Edit term ${term.original}`}
              className={styles.edit}
              onClick={() => onEdit(term)}
            >
              Edit
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
