import type { NovelDetail } from '@webnovel-hub/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { readerApi } from '../../api/catalog';
import { queryKeys } from '../../app/queryClient';
import { useToast } from '../../components/ui';
import { setReaderLibrary } from '../library/libraryActions';

/**
 * Records a chapter as read. The saved progress then shows everywhere:
 * the reader, the novel page, its chapter list (read and NEW markers) and the library.
 */
export function useMarkRead(novelId: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (chapter: number) => readerApi.markRead(novelId, chapter),
    onSuccess: (library) => {
      setReaderLibrary(queryClient, novelId, () => library);
      queryClient.setQueryData<NovelDetail>(queryKeys.novel(novelId), (novel) =>
        novel ? { ...novel, library } : novel,
      );
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.novel(novelId), 'chapters'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.library });
      // A new history row: the history and the profile's statistics change too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.history });
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile });
    },
    onError: (error) =>
      toast({ title: "Couldn't save your place", description: error.message, tone: 'error' }),
  });
}

/** Tries a failed chapter again; the reader then polls it while it is fetched. */
export function useRetryFetch(novelId: string, chapter: number) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: () => readerApi.fetch(novelId, chapter),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.reader(novelId, chapter) }),
    onError: (error) =>
      toast({ title: "Couldn't try again", description: error.message, tone: 'error' }),
  });
}
