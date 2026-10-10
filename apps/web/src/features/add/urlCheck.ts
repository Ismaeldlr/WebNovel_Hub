import type { SourceSite } from '@webnovel-hub/shared';

export type UrlCheck =
  | { kind: 'empty' }
  | { kind: 'invalid'; message: string }
  | { kind: 'unsupported'; host: string; message: string }
  /** `source` is null when the supported sites couldn't be loaded: the API will decide. */
  | { kind: 'ready'; url: string; source: SourceSite | null };

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
/** "royalroad.com/fiction/1": a host with a dot, then optionally a path. */
const LOOKS_LIKE_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#]|$)/i;

/**
 * Checks a pasted address as the reader types, with the same rules as the API:
 * an http(s) URL without credentials whose host an importable source lists. An address
 * without a scheme gets https://. Which page of a site is a novel, the scraper decides.
 */
export function checkUrl(input: string, sources: readonly SourceSite[] | undefined): UrlCheck {
  let text = input.trim();
  if (!text) return { kind: 'empty' };
  if (!HAS_SCHEME.test(text)) {
    if (!LOOKS_LIKE_HOST.test(text)) {
      return {
        kind: 'invalid',
        message: "That doesn't look like a web address. Paste the novel's full URL.",
      };
    }
    text = `https://${text}`;
  }

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return {
      kind: 'invalid',
      message: "That doesn't look like a web address. Paste the novel's full URL.",
    };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { kind: 'invalid', message: 'Use a web address that starts with https:// or http://.' };
  }
  if (url.username || url.password) {
    return { kind: 'invalid', message: 'Remove the sign-in details from the address.' };
  }

  if (!sources) return { kind: 'ready', url: text, source: null };
  const source = sources.find((site) => site.importable && site.hosts.includes(url.hostname));
  if (!source) {
    // The Add Novels page lists the supported sites under the form.
    const listed = sources.some((site) => site.importable && site.homeUrl);
    return {
      kind: 'unsupported',
      host: url.hostname,
      message: `Webnovel Hub can't import from ${url.hostname}.${listed ? ' The supported sites are listed below.' : ''}`,
    };
  }
  return { kind: 'ready', url: text, source };
}
