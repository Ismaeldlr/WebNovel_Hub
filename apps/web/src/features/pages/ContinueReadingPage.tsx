import { useQuery } from '@tanstack/react-query';
import { BookOpen, Library } from 'lucide-react';
import { Navigate } from 'react-router';
import { historyApi } from '../../api/history';
import { HOME_PATH } from '../../app/navigation';
import { queryKeys } from '../../app/queryClient';
import { ButtonLink, EmptyState, ErrorState, LoadingState } from '../../components/ui';
import { usePageTitle } from '../../lib/hooks';
import { readerPath } from '../../lib/reading';

/** Opens the chapter read last, in whichever novel; says so when nothing was read yet. */
export function ContinueReadingPage() {
  usePageTitle('Continue Reading');
  const last = useQuery({
    queryKey: [...queryKeys.history, 'last-read'],
    queryFn: async ({ signal }) =>
      (await historyApi.chapters({ range: 'all', novelId: null }, null, signal)).items[0] ?? null,
    staleTime: 0,
  });

  if (last.isPending) return <LoadingState label="Finding where you left off" />;
  if (last.isError) {
    return (
      <ErrorState
        title="Couldn't find where you left off"
        message={last.error.message}
        onRetry={() => void last.refetch()}
        retrying={last.isFetching}
      />
    );
  }
  if (last.data) {
    return <Navigate to={readerPath(last.data.novel.id, last.data.chapter.number)} replace />;
  }
  return (
    <EmptyState
      icon={<BookOpen aria-hidden="true" />}
      title="Nothing to continue yet"
      action={
        <ButtonLink to={HOME_PATH} variant="primary" icon={<Library aria-hidden="true" />}>
          Go to My Library
        </ButtonLink>
      }
    >
      <p>Open a chapter from your library, and this page will take you back to it.</p>
    </EmptyState>
  );
}
