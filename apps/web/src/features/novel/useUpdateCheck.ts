import { EPUB_SOURCE, type NovelDetail, type UpdateRun, isJobFinished } from '@webnovel-hub/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { updatesApi } from '../../api/catalog';
import { queryKeys } from '../../app/queryClient';
import { useToast } from '../../components/ui';

/** How often a waiting or running check is polled. */
export const UPDATE_CHECK_POLL_MS = 1_500;

export interface UpdateCheckState {
  /** False for EPUB imports: they have no source site to check. */
  available: boolean;
  /** The novel's check while it waits or runs, whoever started it. */
  active: UpdateRun | null;
  /** A check this page followed to its end; shown until the next one starts. */
  finished: UpdateRun | null;
  starting: boolean;
  start: () => void;
}

/**
 * The novel's manual update check: start one, follow it by polling the
 * novel's latest check, and refresh the novel, its chapters and the library once it ends.
 */
export function useUpdateCheck(novel: NovelDetail): UpdateCheckState {
  const queryClient = useQueryClient();
  const toast = useToast();
  const available = novel.source.key !== EPUB_SOURCE;
  const checkKey = queryKeys.updateCheck(novel.id);

  const latest = useQuery({
    queryKey: checkKey,
    queryFn: ({ signal }) => updatesApi.latest(novel.id, signal),
    enabled: available,
    refetchInterval: (query) => {
      const check = query.state.data;
      return check && !isJobFinished(check.status) ? UPDATE_CHECK_POLL_MS : false;
    },
  });
  const start = useMutation({
    mutationFn: () => updatesApi.check(novel.id),
    onSuccess: (check) => queryClient.setQueryData(checkKey, check),
    onError: (error) =>
      toast({
        title: "Couldn't check for new chapters",
        description: error.message,
        tone: 'error',
      }),
  });

  const check = latest.data ?? null;
  const active = check && !isJobFinished(check.status) ? check : null;
  // Follow a check seen waiting or running, so its outcome shows when it ends.
  const [followedId, setFollowedId] = useState<string | null>(null);
  if (active && active.id !== followedId) setFollowedId(active.id);
  const finished = check && !active && check.id === followedId ? check : null;

  const finishedId = finished?.id ?? null;
  useEffect(() => {
    if (finishedId === null) return;
    // New chapters change the novel, its chapter list, the library, Explore and the reader's
    // navigation; the check itself belongs on the Update Jobs page.
    void queryClient.invalidateQueries({ queryKey: queryKeys.novel(novel.id) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.library });
    void queryClient.invalidateQueries({ queryKey: queryKeys.searches });
    void queryClient.invalidateQueries({ queryKey: queryKeys.readerNovel(novel.id) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.updateRuns });
  }, [finishedId, novel.id, queryClient]);

  return {
    available,
    active,
    finished,
    starting: start.isPending,
    start: () => start.mutate(),
  };
}
