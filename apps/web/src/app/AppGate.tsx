import { useQuery } from '@tanstack/react-query';
import { Outlet } from 'react-router';
import { getSources } from '../api/catalog';
import { Splash } from '../components/Splash';
import { ErrorState } from '../components/ui';
import { ThemeFromPreferences } from '../features/preferences/ThemeFromPreferences';
import { queryKeys } from './queryClient';

/**
 * Opens the library before any page shows: the splash meanwhile, and a way to try again
 * when it can't be opened. Every page shows the reader's theme.
 */
export function AppGate() {
  const open = useQuery({
    queryKey: queryKeys.open,
    queryFn: ({ signal }) => getSources(signal),
    staleTime: Infinity,
    retry: false,
  });

  if (open.isPending) return <Splash />;
  if (open.isError) {
    return (
      <div role="main">
        <ErrorState
          title="Webnovel Hub can't open right now"
          message={open.error.message}
          onRetry={() => void open.refetch()}
          retrying={open.isFetching}
        />
      </div>
    );
  }
  return (
    <>
      <ThemeFromPreferences />
      <Outlet />
    </>
  );
}
