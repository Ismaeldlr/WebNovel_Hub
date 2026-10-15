import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Shelf } from '@webnovel-hub/shared';
import { shelvesApi } from '../../api/catalog';
import { queryKeys } from '../../app/queryClient';
import { useToast } from '../../components/ui';

/** The reader's shelves, in their order, with their counts. */
export function useShelves() {
  return useQuery({
    queryKey: queryKeys.shelves,
    queryFn: ({ signal }) => shelvesApi.list(signal),
  });
}

/**
 * Making, renaming, ordering and deleting shelves. Each change refreshes the shelves and,
 * for a deletion, the novels that were on it.
 */
export function useShelfChanges() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.shelves });
  const failed = (title: string) => (error: Error) =>
    toast({ title, description: error.message, tone: 'error' });

  return {
    create: useMutation({
      mutationFn: (name: string) => shelvesApi.create(name),
      onSuccess: (shelf) =>
        queryClient.setQueryData<Shelf[]>(queryKeys.shelves, (shelves) =>
          shelves ? [...shelves, shelf] : shelves,
        ),
      onSettled: refresh,
    }),
    rename: useMutation({
      mutationFn: ({ id, name }: { id: string; name: string }) => shelvesApi.rename(id, name),
      onSettled: refresh,
    }),
    reorder: useMutation({
      mutationFn: (ids: string[]) => shelvesApi.reorder(ids),
      onMutate: (ids) =>
        queryClient.setQueryData<Shelf[]>(queryKeys.shelves, (shelves) =>
          shelves ? ids.flatMap((id) => shelves.filter((shelf) => shelf.id === id)) : shelves,
        ),
      onError: failed("Couldn't move the shelf"),
      onSettled: refresh,
    }),
    remove: useMutation({
      mutationFn: (shelf: Shelf) => shelvesApi.remove(shelf.id),
      onSuccess: (_result, shelf) => toast({ title: `Shelf “${shelf.name}” deleted` }),
      onError: failed("Couldn't delete the shelf"),
      // The novels that were on it: their shelves changed.
      onSettled: () => {
        void queryClient.invalidateQueries({ queryKey: ['novel'] });
        return queryClient.invalidateQueries({ queryKey: queryKeys.library });
      },
    }),
  };
}
