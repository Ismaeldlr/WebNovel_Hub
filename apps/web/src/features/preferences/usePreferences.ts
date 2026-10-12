import type { PreferencesUpdate, ReaderPreferences } from '@webnovel-hub/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { userApi } from '../../api/user';
import { useToast } from '../../components/ui';
import { PREFERENCES_QUERY_KEY, readMirror, saverFor, writeMirror } from './store';

/**
 * The reader's preferences. Until the library answers, this device's mirror of them
 * stands in, so the first screen already has the right theme and text size.
 */
export function usePreferences() {
  const saver = saverFor(useQueryClient());
  const query = useQuery({
    queryKey: PREFERENCES_QUERY_KEY,
    queryFn: async ({ signal }) => saver.received(await userApi.preferences(signal)),
    initialData: readMirror,
    // The mirror may be old: read the saved preferences at once all the same.
    initialDataUpdatedAt: 0,
  });

  const { data } = query;
  useEffect(() => {
    if (data) writeMirror(data);
  }, [data]);
  return query;
}

/**
 * Changes preferences: applied at once everywhere they show, saved in the background a
 * moment after the last change. A failed save says so and goes back to the
 * saved preferences.
 */
export function useUpdatePreferences(): (changes: PreferencesUpdate) => void {
  const saver = saverFor(useQueryClient());
  const toast = useToast();
  useEffect(() => {
    saver.setErrorHandler((error) =>
      toast({
        title: "Couldn't save your reading settings",
        description: `${error.message} They're back to how they were saved.`,
        tone: 'error',
      }),
    );
  }, [saver, toast]);
  return useCallback((changes: PreferencesUpdate) => saver.change(changes), [saver]);
}

/**
 * Preferences as a form's controls show them: a change shows in the controls at once. The
 * query that applies it everywhere else tells its views a tick later, which would make a
 * dragged slider stutter back and forth. Whatever the query then holds wins, a save or a
 * rollback included.
 */
export function useShownPreferences(
  preferences: ReaderPreferences,
  onChange: (changes: PreferencesUpdate) => void,
) {
  const [shown, setShown] = useState(preferences);
  const [latest, setLatest] = useState(preferences);
  if (preferences !== latest) {
    setLatest(preferences);
    setShown(preferences);
  }
  const change = useCallback(
    (changes: PreferencesUpdate) => {
      setShown((current) => ({ ...current, ...changes }));
      onChange(changes);
    },
    [onChange],
  );
  return [shown, change] as const;
}

/** Whether the latest changes are being saved, saved, or were refused. */
export function useSaveStatus() {
  const saver = saverFor(useQueryClient());
  return useSyncExternalStore(saver.subscribe, saver.getStatus);
}
