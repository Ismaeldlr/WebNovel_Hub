import { type ExportItem, isJobFinished } from '@webnovel-hub/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileDown } from 'lucide-react';
import { exportApi } from '../../api/catalog';
import { queryKeys } from '../../app/queryClient';
import { NovelRow, NovelRowList } from '../../components/NovelRow';
import { ButtonLink, EmptyState, ErrorState, LoadingState } from '../../components/ui';
import { FullFetchButton, FullFetchStatus } from '../novel/FullFetch';
import { FULL_FETCH_POLL_MS, fullFetchState, useFullFetchControls } from '../novel/useFullFetch';
import { PageHeader } from '../pages/PageHeader';
import { ExportButton } from './ExportButton';

/**
 * Exports: the novels the reader asked to fetch in full, how far each fetch has
 * got, and their EPUB files once the chapters are stored.
 */
export function ExportsPage() {
  const exports = useQuery({
    queryKey: queryKeys.exports,
    queryFn: ({ signal }) => exportApi.list(signal),
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => item.fetch && !isJobFinished(item.fetch.status))
        ? FULL_FETCH_POLL_MS
        : false,
  });
  const items = exports.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Exports"
        lead="Fetch every chapter of a novel, then save it as an EPUB file for any e-book app or e-reader."
      />
      {exports.isPending ? (
        <LoadingState label="Loading your exports" />
      ) : exports.isError ? (
        <ErrorState
          title="Your exports didn't load"
          message={exports.error.message}
          onRetry={() => void exports.refetch()}
          retrying={exports.isFetching}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<FileDown aria-hidden="true" />}
          title="Nothing to export yet"
          action={
            <ButtonLink to="/library" variant="primary">
              Go to My Library
            </ButtonLink>
          }
        >
          <p>
            Open a novel and choose <strong>Fetch all chapters</strong>. It is listed here while its
            chapters arrive, and you can export it once they are stored.
          </p>
        </EmptyState>
      ) : (
        <section aria-labelledby="exports-list">
          <h2 id="exports-list" className="visually-hidden">
            Novels you asked to fetch, latest first
          </h2>
          <NovelRowList>
            {items.map((item) => (
              <li key={item.novel.id}>
                <ExportRow item={item} />
              </li>
            ))}
          </NovelRowList>
        </section>
      )}
    </>
  );
}

/** One novel: its fetch as the novel page shows it, Export EPUB, and Fetch all again. */
function ExportRow({ item }: { item: ExportItem }) {
  const { novel } = item;
  const queryClient = useQueryClient();
  const controls = useFullFetchControls(novel.id, (data) =>
    queryClient.setQueryData(queryKeys.fullFetch(novel.id), data),
  );
  const state = fullFetchState(novel, item, controls, {
    totalChapters: item.totalChapters,
    showFinished: () => true,
  });
  const ready = !state.active && state.storedChapters >= state.totalChapters;

  return (
    <NovelRow
      novel={novel}
      actions={
        <>
          <ExportButton
            novel={novel}
            storedChapters={state.storedChapters}
            totalChapters={state.totalChapters}
            variant={ready ? 'primary' : 'secondary'}
          />
          <FullFetchButton state={state} />
        </>
      }
    >
      <FullFetchStatus novel={novel} state={state} compact />
    </NovelRow>
  );
}
