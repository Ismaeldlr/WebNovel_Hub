import type { Term, TermCreate } from '@webnovel-hub/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { termsApi } from '../../api/terms';
import { queryKeys } from '../../app/queryClient';
import { useToast } from '../../components/ui';

/** The terms a novel's chapters use; none until they arrive. */
export function useNovelTerms(novelId: string) {
  return useQuery({
    queryKey: queryKeys.novelTerms(novelId),
    queryFn: ({ signal }) => termsApi.forNovel(novelId, signal),
  });
}

/** Adds a term, or changes the one given. Every list of terms shows it at once. */
export function useSaveTerm(term: Term | null) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (fields: TermCreate) =>
      term ? termsApi.update(term.id, fields) : termsApi.create(fields),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.terms });
      toast({ title: term ? 'Term saved' : 'Term added', tone: 'success' });
    },
  });
}

export function useDeleteTerm() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (term: Term) => termsApi.remove(term.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.terms });
      toast({ title: 'Term deleted', tone: 'success' });
    },
  });
}
