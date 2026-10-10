import {
  EPUB_SOURCE,
  type FullFetch,
  type FullFetchResponse,
  type NovelSummary,
  isJobFinished,
} from '@webnovel-hub/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { fullFetchApi } from '../../api/catalog';
import { queryKeys } from '../../app/queryClient';
import { useToast } from '../../components/ui';

/** How often a waiting or running fetch is polled; chapters arrive many seconds apart. */
export const FULL_FETCH_POLL_MS = 3_000;

export interface FullFetchState {
  /** False for EPUB imports: every chapter came with the file. */
  available: boolean;
  /** The novel's fetch while it waits or runs, whoever asked for it. */
  active: FullFetch | null;
  /** A fetch that ended, shown until the next one starts. */
  finished: FullFetch | null;
  storedChapters: number;
  totalChapters: number;
  starting: boolean;
  stopping: boolean;
  start: () => void;
  stop: () => void;
}

/**
 * Starting and stopping a novel's whole-novel fetch, with their toasts. `onChange` gets
 * the novel's fetch as it is afterwards; the Exports list is refreshed either way.
 */
export function useFullFetchControls(novelId: string, onChange: (data: FullFetchResponse) => void) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const changed = (data: FullFetchResponse) => {
    onChange(data);
    void queryClient.invalidateQueries({ queryKey: queryKeys.exports });
  };
  const start = useMutation({
    mutationFn: () => fullFetchApi.start(novelId),
    onSuccess: changed,
    onError: (error) =>
      toast({ title: "Couldn't fetch all chapters", description: error.message, tone: 'error' }),
  });
  const stop = useMutation({
    mutationFn: () => fullFetchApi.cancel(novelId),
    onSuccess: (data) => {
      changed(data);
      toast({
        title: 'Stopped fetching all chapters',
        description: 'The chapters fetched so far are kept.',
        tone: 'success',
      });
    },
    onError: (error) =>
      toast({ title: "Couldn't stop fetching", description: error.message, tone: 'error' }),
  });
  return { start, stop };
}

/** A novel's fetch as FullFetchButton and FullFetchStatus show it. */
export function fullFetchState(
  novel: Pick<NovelSummary, 'source'>,
  data: FullFetchResponse | undefined,
  controls: ReturnType<typeof useFullFetchControls>,
  options: { totalChapters: number; showFinished: (fetch: FullFetch) => boolean },
): FullFetchState {
  const fetch = data?.fetch ?? null;
  const active = fetch && !isJobFinished(fetch.status) ? fetch : null;
  const { start, stop } = controls;
  return {
    available: novel.source.key !== EPUB_SOURCE,
    active,
    finished: fetch && !active && options.showFinished(fetch) ? fetch : null,
    storedChapters: data?.storedChapters ?? 0,
    totalChapters: data?.totalChapters ?? options.totalChapters,
    starting: start.isPending,
    stopping: stop.isPending,
    start: () => start.mutate(),
    stop: () => stop.mutate(),
  };
}

/**
 * "Fetch all chapters" of a novel (plan 18): start it, follow it by polling, stop it, and
 * refresh the chapter list as chapters arrive. Also how many chapters are stored, which
 * decides whether the novel can be exported, EPUB imports included.
 */
export function useFullFetch(novel: NovelSummary): FullFetchState {
  const queryClient = useQueryClient();
  const key = queryKeys.fullFetch(novel.id);

  const latest = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => fullFetchApi.get(novel.id, signal),
    refetchInterval: (query) => {
      const fetch = query.state.data?.fetch;
      return fetch && !isJobFinished(fetch.status) ? FULL_FETCH_POLL_MS : false;
    },
  });
  const controls = useFullFetchControls(novel.id, (data) => queryClient.setQueryData(key, data));

  // Follow a fetch seen waiting or running, so its outcome shows when it ends.
  const [followedId, setFollowedId] = useState<string | null>(null);
  const fetch = latest.data?.fetch;
  if (fetch && !isJobFinished(fetch.status) && fetch.id !== followedId) setFollowedId(fetch.id);

  // New chapters stored: the chapter list and the reader's navigation change with them.
  const stored = latest.data?.storedChapters;
  const seen = useRef(stored);
  useEffect(() => {
    const before = seen.current;
    seen.current = stored;
    if (before === undefined || stored === undefined || stored === before) return;
    void queryClient.invalidateQueries({ queryKey: [...queryKeys.novel(novel.id), 'chapters'] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.readerNovel(novel.id) });
  }, [stored, novel.id, queryClient]);

  return fullFetchState(novel, latest.data, controls, {
    totalChapters: novel.totalChapters,
    showFinished: (ended) => ended.id === followedId,
  });
}
