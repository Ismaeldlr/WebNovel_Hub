import type { HttpClient } from '@webnovel-hub/core/scraper';

/** HTTP through Node's fetch, which follows redirects and sets any header asked for. */
export function nodeHttpClient(): HttpClient {
  return {
    async request({ url, method, headers, body, timeout }) {
      const response = await fetch(url, {
        method,
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(timeout),
        ...(body === undefined
          ? {}
          : { body: typeof body === 'string' ? body : new Uint8Array(body) }),
      });
      return {
        url: response.url,
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: new Uint8Array(await response.arrayBuffer()),
      };
    },
  };
}
