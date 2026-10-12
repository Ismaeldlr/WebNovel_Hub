import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useToast } from '../../components/ui';
import { usePreferences, useUpdatePreferences } from '../preferences/usePreferences';
import { WTR_LAB, WTR_LAB_SECTION, useWtrLabAccount } from '../settings/wtrLabAccount';

/**
 * When the address is a WTR Lab novel and the app isn't signed in there, says once that
 * chapters past the 10th may not come, offering to sign in. A reader who doesn't mind is
 * asked whether those chapters should come in machine translation instead.
 */
export function useWtrLabNotice(source: string | undefined) {
  const isWtrLab = source === WTR_LAB;
  const account = useWtrLabAccount(isWtrLab);
  const preferences = usePreferences().data;
  const update = useUpdatePreferences();
  const toast = useToast();
  const navigate = useNavigate();
  const shown = useRef(false);

  const signedOut = account.data?.signedIn === false;
  const machine = preferences?.wtrLabMachineTranslation;
  useEffect(() => {
    if (!isWtrLab || !signedOut || machine !== false || shown.current) return;
    shown.current = true;
    toast({
      title: "You're not signed in to WTR Lab",
      description:
        'Past chapter 10, its AI translation needs an account, so those chapters may not download.',
      actions: [
        { label: 'Sign in', onClick: () => void navigate(`/settings/accounts#${WTR_LAB_SECTION}`) },
        {
          label: "I don't care",
          onClick: () =>
            toast({
              title: 'Get machine-translated chapters instead?',
              description:
                "Chapters that need an account would come in WTR Lab's machine translation (MTL) rather than its AI one.",
              actions: [
                {
                  label: 'Yes, use MTL',
                  onClick: () => {
                    update({ wtrLabMachineTranslation: true });
                    toast({
                      tone: 'success',
                      title: 'Those chapters will come machine-translated',
                      description: 'You can change this under WTR Lab in Settings.',
                    });
                  },
                },
                {
                  label: 'No',
                  onClick: () =>
                    toast({
                      title: 'Those chapters will wait until you sign in',
                      description: 'You can sign in under WTR Lab in Settings.',
                    }),
                },
              ],
            }),
        },
      ],
    });
  }, [isWtrLab, signedOut, machine, toast, navigate, update]);
}
