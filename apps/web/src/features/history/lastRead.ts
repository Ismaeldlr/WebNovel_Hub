import { queryOptions } from '@tanstack/react-query';
import { historyApi } from '../../api/history';
import { queryKeys } from '../../app/queryClient';

/** The chapter read last, in whichever novel, or null before anything was read. */
export const lastReadQuery = queryOptions({
  queryKey: [...queryKeys.history, 'last-read'],
  queryFn: async ({ signal }) =>
    (await historyApi.chapters({ range: 'all', novelId: null }, null, signal)).items[0] ?? null,
  staleTime: 0,
});
