import type {
  LibraryItem,
  LibraryPage,
  LibraryState,
  LibraryStatus,
  NovelDetail,
  ReaderChapterResponse,
  SearchResponse,
} from '@webnovel-hub/shared';
import {
  type InfiniteData,
  type QueryClient,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { libraryApi } from '../../api/catalog';
import { queryKeys } from '../../app/queryClient';
import { useToast } from '../../components/ui';

type Patch = Partial<LibraryState>;

/** Sets the library state the reader shows for every cached chapter of a novel. */
export function setReaderLibrary(
  queryClient: QueryClient,
  novelId: string,
  update: (library: LibraryState | null) => LibraryState | null,
): void {
  queryClient.setQueriesData<ReaderChapterResponse>(
    { queryKey: queryKeys.readerNovel(novelId) },
    (chapter) => (chapter ? { ...chapter, library: update(chapter.library) } : chapter),
  );
}

/** Drops a deleted novel from the search results. */
function dropFromSearches(queryClient: QueryClient, novelId: string): void {
  queryClient.setQueriesData<SearchResponse>(
    { queryKey: queryKeys.searches },
    (found) =>
      found && { ...found, results: found.results.filter((result) => result.novel.id !== novelId) },
  );
}

/**
 * Applies a change to one novel's library state everywhere it is cached: its page, the
 * reader and every library list. `null` removes it from the library.
 *
 * A changed novel stays where it is in a filtered list (a favourite unstarred under
 * "Favorites only" doesn't vanish from under the pointer or the keyboard focus); the
 * lists are marked stale, so the next filter change or visit loads them afresh.
 */
function patchCaches(queryClient: QueryClient, novelId: string, patch: Patch | null): void {
  setReaderLibrary(queryClient, novelId, (library) =>
    patch === null ? null : library && { ...library, ...patch },
  );
  queryClient.setQueryData<NovelDetail>(queryKeys.novel(novelId), (novel) => {
    if (!novel) return novel;
    if (patch === null) return { ...novel, library: null };
    return novel.library ? { ...novel, library: { ...novel.library, ...patch } } : novel;
  });
  queryClient.setQueriesData<InfiniteData<LibraryPage>>(
    { queryKey: queryKeys.libraryLists },
    (list) => {
      if (!list) return list;
      return {
        ...list,
        pages: list.pages.map((page) => ({
          ...page,
          items:
            patch === null
              ? page.items.filter((item) => item.novel.id !== novelId)
              : page.items.map((item) =>
                  item.novel.id === novelId
                    ? { ...item, library: { ...item.library, ...patch } }
                    : item,
                ),
        })),
      };
    },
  );
  if (patch === null) dropFromSearches(queryClient, novelId);
}

/** Deletes a novel from the library, and so from this device. */
export function useRemoveFromLibrary() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ novelId }: { novelId: string; title: string }) => libraryApi.remove(novelId),
    onSuccess: (_, { novelId, title }) => {
      patchCaches(queryClient, novelId, null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.library });
      queryClient.removeQueries({ queryKey: queryKeys.novel(novelId) });
      toast({ title: `“${title}” was deleted.`, tone: 'success' });
    },
    onError: (error) =>
      toast({ title: "Couldn't delete it", description: error.message, tone: 'error' }),
  });
}

/**
 * Status and favourite change at once on screen (optimistic), then follow the server's
 * answer; a failure puts back what the server has.
 */
function useLibraryUpdate<Vars extends { novelId: string }>(options: {
  request: (vars: Vars) => Promise<LibraryItem>;
  optimistic: (vars: Vars) => Patch;
  failure: string;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: options.request,
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.novel(vars.novelId), exact: true });
      patchCaches(queryClient, vars.novelId, options.optimistic(vars));
    },
    onSuccess: (item) => patchCaches(queryClient, item.novel.id, item.library),
    onError: (error, vars) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.novel(vars.novelId), exact: true });
      void queryClient.invalidateQueries({ queryKey: queryKeys.libraryLists });
      toast({ title: options.failure, description: error.message, tone: 'error' });
    },
    onSettled: () => {
      // Stale, not refetched: see patchCaches.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.libraryLists,
        refetchType: 'none',
      });
      return queryClient.invalidateQueries({ queryKey: queryKeys.libraryStats });
    },
  });
}

export function useSetStatus() {
  return useLibraryUpdate({
    request: ({ novelId, status }: { novelId: string; status: LibraryStatus }) =>
      libraryApi.setStatus(novelId, status),
    optimistic: ({ status }) => ({ status }),
    failure: "Couldn't change the status",
  });
}

export function useSetFavorite() {
  return useLibraryUpdate({
    request: ({ novelId, isFavorite }: { novelId: string; isFavorite: boolean }) =>
      libraryApi.setFavorite(novelId, isFavorite),
    optimistic: ({ isFavorite }) => ({ isFavorite }),
    failure: "Couldn't change the favourite",
  });
}
