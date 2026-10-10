import type {
  PreferencesResponse,
  PreferencesUpdate,
  Profile,
  ProfileResponse,
  ReaderPreferences,
} from '@webnovel-hub/shared';
import { apiRequest } from './client';

/** The reader's profile statistics and preferences. */
export const userApi = {
  profile: async (signal?: AbortSignal): Promise<Profile> =>
    (await apiRequest<ProfileResponse>('/user/profile', { signal })).profile,

  preferences: async (signal?: AbortSignal): Promise<ReaderPreferences> =>
    (await apiRequest<PreferencesResponse>('/user/preferences', { signal })).preferences,

  /** Saves the given preferences; resolves to all of them, as saved. */
  updatePreferences: async (changes: PreferencesUpdate): Promise<ReaderPreferences> =>
    (
      await apiRequest<PreferencesResponse>('/user/preferences', {
        method: 'PATCH',
        body: changes,
      })
    ).preferences,
};
