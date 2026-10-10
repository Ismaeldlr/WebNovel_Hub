import { useQuery } from '@tanstack/react-query';
import { accountsApi } from '../../api/catalog';
import { queryKeys } from '../../app/queryClient';

export const WTR_LAB = 'wtr_lab';
export const WTR_LAB_SECTION = 'settings-wtr-lab';

/** Whether the app is signed in to WTR Lab: null while unknown or on a device that can't tell. */
export function useWtrLabAccount(enabled = true) {
  return useQuery({
    queryKey: queryKeys.account(WTR_LAB),
    queryFn: ({ signal }) => accountsApi.status(WTR_LAB, signal),
    staleTime: 5 * 60_000,
    enabled,
  });
}
