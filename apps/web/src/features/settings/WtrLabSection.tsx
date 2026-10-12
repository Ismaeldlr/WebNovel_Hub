import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PreferencesUpdate, ReaderPreferences } from '@webnovel-hub/shared';
import { CircleCheck, ExternalLink, KeyRound } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { accountsApi } from '../../api/catalog';
import { queryKeys } from '../../app/queryClient';
import { Button, Card, Notice, TextField, useToast } from '../../components/ui';
import { appKind, getPlatform } from '../../platform';
import { Choices } from './AppSettings';
import { SectionHeading } from './SectionHeading';
import { WTR_LAB, WTR_LAB_SECTION, useWtrLabAccount } from './wtrLabAccount';
import styles from './SettingsPage.module.css';

const MACHINE_OPTIONS = [
  {
    value: 'skip',
    label: "Don't fetch them",
    detail: 'They wait, with a message asking you to sign in.',
  },
  {
    value: 'machine',
    label: 'Fetch the machine translation (MTL)',
    detail: "WTR Lab's Google translation: rougher than its AI one.",
  },
] as const;

/**
 * WTR Lab shows its AI translation to guests for a novel's first 10 chapters only. The
 * reader signs in on WTR Lab's page in a window of the app, then pastes the link from
 * WTR Lab's email here, so it opens in the app's web view rather than their browser.
 */
export function WtrLabSection({
  preferences,
  onChange,
}: {
  preferences: ReaderPreferences;
  onChange: (changes: PreferencesUpdate) => void;
}) {
  const account = useWtrLabAccount();
  const queryClient = useQueryClient();
  const toast = useToast();
  const location = useLocation();
  const [link, setLink] = useState('');

  // Add Novels' "Sign in" leads here.
  useEffect(() => {
    if (location.hash === `#${WTR_LAB_SECTION}`) {
      document.getElementById(WTR_LAB_SECTION)?.scrollIntoView({ block: 'start' });
    }
  }, [location.hash]);

  const signIn = useMutation({
    mutationFn: () => accountsApi.signInWithLink(WTR_LAB, link),
    onSuccess: (status) => {
      queryClient.setQueryData(queryKeys.account(WTR_LAB), status);
      if (status.signedIn) {
        setLink('');
        toast({ tone: 'success', title: 'Signed in to WTR Lab' });
      } else {
        toast({
          tone: 'error',
          title: "That link didn't sign you in",
          description: 'It may have been used or expired. Ask WTR Lab for a new one.',
        });
      }
    },
  });

  const openSignIn = async () => {
    const platform = await getPlatform();
    if (!account.data || !platform.openSiteWindow) return;
    await platform.openSiteWindow(account.data.signInUrl, 'Sign in to WTR Lab');
    void account.refetch();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (link.trim()) signIn.mutate();
  };

  const signedIn = account.data?.signedIn;
  return (
    <Card as="section" aria-labelledby={WTR_LAB_SECTION} className={styles.section}>
      <SectionHeading id={WTR_LAB_SECTION} title="WTR Lab">
        Guests get the AI translation of a novel&apos;s first 10 chapters only. Sign in for the
        rest.
      </SectionHeading>

      {appKind === 'browser' ? (
        <Notice variant="inline">Signing in works in the Windows and Android apps.</Notice>
      ) : (
        <>
          <div className={styles.actions}>
            {signedIn ? (
              <span className={styles.accountStatus}>
                <CircleCheck aria-hidden="true" /> Signed in
              </span>
            ) : (
              <span className={styles.accountStatus}>
                {account.isPending
                  ? 'Checking…'
                  : signedIn === false
                    ? 'Not signed in'
                    : "Couldn't check whether you're signed in"}
              </span>
            )}
            <Button
              size="sm"
              variant="ghost"
              busy={account.isFetching}
              onClick={() => void account.refetch()}
            >
              Check again
            </Button>
          </div>

          {!signedIn && (
            <ol className={styles.steps}>
              <li>
                <span>Open WTR Lab&apos;s sign-in page and enter your email.</span>
                <Button
                  size="sm"
                  icon={<ExternalLink aria-hidden="true" />}
                  onClick={() => void openSignIn()}
                  disabled={!account.data}
                >
                  Open sign-in page
                </Button>
              </li>
              <li>
                In WTR Lab&apos;s email, copy the sign-in link. Don&apos;t open it: it works once,
                and it has to open in the app.
              </li>
              <li>
                <form className={styles.linkForm} onSubmit={submit}>
                  <TextField
                    label="Paste the sign-in link"
                    value={link}
                    onChange={(event) => setLink(event.target.value)}
                    placeholder="https://wtr-lab.com/…"
                    autoComplete="off"
                    error={signIn.error?.message}
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    icon={<KeyRound aria-hidden="true" />}
                    busy={signIn.isPending}
                  >
                    Sign in
                  </Button>
                </form>
              </li>
            </ol>
          )}
        </>
      )}

      <Choices
        legend="Chapters that need an account, while you're not signed in"
        value={preferences.wtrLabMachineTranslation ? 'machine' : 'skip'}
        options={MACHINE_OPTIONS}
        onChange={(value) => onChange({ wtrLabMachineTranslation: value === 'machine' })}
      />
    </Card>
  );
}
