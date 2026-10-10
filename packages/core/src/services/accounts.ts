// Site accounts (WTR Lab): the reader signs in on the site's own page in a window of the
// app, or pastes the link from the site's sign-in email, which opens in the hidden render
// window. Both share the web view's cookies with the rendered chapter pages.
import type { SourceAccountResponse } from '@webnovel-hub/shared';
import { AppError } from '../errors.js';
import type { Registry } from '../scraper/adapters/registry.js';
import { type Fetcher, SourceSession } from '../scraper/session.js';

/** Long enough for a sign-in link's redirects, or a site's bot check on the way. */
const PAGE_TIMEOUT = 30_000;

export interface AccountService {
  /** Whether the app is signed in to the site (null: this device can't tell). */
  status(source: string): Promise<SourceAccountResponse>;
  /** Opens a sign-in link from the site's email in the web view, then checks again. */
  signInWithLink(source: string, link: string): Promise<SourceAccountResponse>;
}

export function createAccountService(registry: Registry, fetcher: Fetcher | null): AccountService {
  const accountOf = (source: string) => {
    const adapter = registry.adapters.find((candidate) => candidate.source === source);
    if (!adapter?.account)
      throw new AppError(404, "That site doesn't have an account to sign in to.");
    return { name: adapter.name, account: adapter.account };
  };

  const status = async (source: string): Promise<SourceAccountResponse> => {
    const { account } = accountOf(source);
    if (!fetcher?.renderer) return { signInUrl: account.signInUrl, signedIn: null };
    try {
      const page = await new SourceSession(fetcher).render(account.statusUrl, {
        timeout: PAGE_TIMEOUT,
      });
      return { signInUrl: account.signInUrl, signedIn: account.signedIn(page.text) };
    } catch {
      return { signInUrl: account.signInUrl, signedIn: null };
    }
  };

  return {
    status,
    async signInWithLink(source, link) {
      const { name } = accountOf(source);
      let url: URL;
      try {
        url = new URL(link.trim());
      } catch {
        url = new URL('invalid:');
      }
      if (url.protocol !== 'https:') {
        throw new AppError(
          400,
          `That isn't a sign-in link. Copy the link from ${name}'s email and paste it here.`,
        );
      }
      if (!fetcher?.renderer) {
        throw new AppError(409, 'Signing in works in the Windows and Android apps.');
      }
      try {
        await new SourceSession(fetcher).render(url.href, { timeout: PAGE_TIMEOUT });
      } catch {
        throw new AppError(502, `${name} didn't open the link. Ask for a new one and try again.`);
      }
      return status(source);
    },
  };
}
