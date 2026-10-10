import { UnsupportedUrl } from './errors.js';

const MALFORMED_MESSAGE = "That doesn't look like a web address. Paste the novel's full URL.";

/** An absolute http(s) URL, or `UnsupportedUrl`. The host comes back in lower case. */
export function parseHttpUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new UnsupportedUrl(`malformed URL: ${JSON.stringify(value)}`, MALFORMED_MESSAGE);
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.hostname === '') {
    throw new UnsupportedUrl(`not a web address: ${JSON.stringify(value)}`, MALFORMED_MESSAGE);
  }
  return url;
}

/** The lower-case host without a leading `www.`, or null for a malformed URL. */
export function hostOf(value: string): string | null {
  try {
    return new URL(value.trim()).hostname.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/** `relative` resolved against `base`, or null when that isn't a valid URL. */
export function resolveUrl(relative: string, base: string): string | null {
  try {
    return new URL(relative, base).href;
  } catch {
    return null;
  }
}
