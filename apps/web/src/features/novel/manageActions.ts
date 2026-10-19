import { COVER_UPLOAD, type NovelDetail, type NovelDetailsUpdate } from '@webnovel-hub/shared';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { novelsApi } from '../../api/catalog';
import { queryKeys } from '../../app/queryClient';
import { useToast } from '../../components/ui';
import { plural } from '../../lib/format';

/** The checks the core makes on a cover first. */
export const COVER_CHECKS = {
  type: 'Choose a JPG, PNG or WebP image.',
  tooLarge: 'This image is larger than 8 MB, the most a cover can be.',
} as const;

/** Why this image can't be a cover, or null when it can. */
export function checkCoverFile(file: File): string | null {
  const extension = file.name.toLowerCase().split('.').pop() ?? '';
  const types: readonly string[] = COVER_UPLOAD.mediaTypes;
  if (!(COVER_UPLOAD.extensions as readonly string[]).includes(extension)) return COVER_CHECKS.type;
  if (file.type !== '' && !types.includes(file.type)) return COVER_CHECKS.type;
  if (file.size > COVER_UPLOAD.maxBytes) return COVER_CHECKS.tooLarge;
  return null;
}

/** Everything that shows a novel's title or cover: lists, search, history, profile, terms. */
function refreshNovelViews(queryClient: QueryClient, novelId: string) {
  for (const queryKey of [
    queryKeys.library,
    queryKeys.searches,
    queryKeys.history,
    queryKeys.profile,
    queryKeys.terms,
    queryKeys.readerNovel(novelId),
  ]) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

/** How much chapter text each novel stores on the device. */
export function useStorage(enabled = true) {
  return useQuery({
    queryKey: queryKeys.storage,
    queryFn: ({ signal }) => novelsApi.storage(signal),
    enabled,
  });
}

/**
 * Deletes a novel's downloaded chapters (DELETE /novels/:id/downloads): the novel, its
 * chapter list and progress stay, and chapters download again when read.
 */
export function useClearDownloads() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ novelId }: { novelId: string; title: string }) =>
      novelsApi.clearDownloads(novelId),
    onSuccess: (cleared, { novelId, title }) => {
      for (const queryKey of [
        queryKeys.novel(novelId),
        queryKeys.readerNovel(novelId),
        queryKeys.library,
        queryKeys.exports,
        queryKeys.storage,
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
      toast({
        title: `Deleted ${plural(cleared, 'downloaded chapter')} of “${title}”`,
        description: 'The novel and your progress stay. Chapters download again as you read.',
        tone: 'success',
      });
    },
    onError: (error) =>
      toast({ title: "Couldn't delete the downloads", description: error.message, tone: 'error' }),
  });
}

/** Saves a novel's details (PATCH /novels/:id); the page shows them at once. */
export function useUpdateDetails(novelId: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (changes: NovelDetailsUpdate) => novelsApi.updateDetails(novelId, changes),
    onSuccess: (novel) => {
      queryClient.setQueryData<NovelDetail>(queryKeys.novel(novelId), novel);
      refreshNovelViews(queryClient, novelId);
      toast({ title: 'Details saved', tone: 'success' });
    },
  });
}

/** Uploads a new cover. */
export function useUploadCover(novelId: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (file: File) => novelsApi.uploadCover(novelId, file),
    onSuccess: (novel) => {
      queryClient.setQueryData<NovelDetail>(queryKeys.novel(novelId), novel);
      refreshNovelViews(queryClient, novelId);
      toast({ title: 'Cover changed', tone: 'success' });
    },
    onError: (error) =>
      toast({ title: "Couldn't change the cover", description: error.message, tone: 'error' }),
  });
}

/** Deletes the novel and its chapters, then goes to the library. */
export function useDeleteNovel(novelId: string, title: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => novelsApi.deleteNovel(novelId),
    onSuccess: () => {
      void navigate('/library', { replace: true });
      queryClient.removeQueries({ queryKey: queryKeys.novel(novelId) });
      queryClient.removeQueries({ queryKey: queryKeys.readerNovel(novelId) });
      refreshNovelViews(queryClient, novelId);
      toast({ title: `“${title}” was deleted`, tone: 'success' });
    },
  });
}
