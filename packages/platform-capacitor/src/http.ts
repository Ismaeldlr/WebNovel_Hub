// Requests to source sites through Capacitor's native HTTP client, outside the page's
// cross-origin rules. Bytes travel as base64 both ways.
import { CapacitorHttp, registerPlugin } from '@capacitor/core';
import type { HttpClient, PageRenderer } from '@webnovel-hub/core';

export function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(text);
}

const fromBase64 = (text: string): Uint8Array =>
  Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

const isJson = (contentType: string | undefined) => contentType?.includes('application/json');

/**
 * The body as bytes. The native client hands back base64 as asked, except for an error
 * status (text) and a JSON answer (already parsed): those are turned back into bytes.
 */
function responseBytes(data: unknown, status: number, contentType: string | undefined) {
  if (typeof data === 'string') {
    return status < 400 && !isJson(contentType) ? fromBase64(data) : new TextEncoder().encode(data);
  }
  return new TextEncoder().encode(data === undefined || data === null ? '' : JSON.stringify(data));
}

export function capacitorHttp(): HttpClient {
  return {
    async request({ url, method, headers, body, timeout }) {
      const sent = { ...headers };
      // Without a content type the native client sends no body at all.
      if (body !== undefined && !Object.keys(sent).some((name) => /^content-type$/i.test(name))) {
        sent['Content-Type'] =
          typeof body === 'string' ? 'text/plain;charset=UTF-8' : 'application/octet-stream';
      }
      const request = CapacitorHttp.request({
        url,
        method,
        headers: sent,
        connectTimeout: timeout,
        readTimeout: timeout,
        responseType: 'arraybuffer',
        ...(body === undefined
          ? {}
          : typeof body === 'string'
            ? { data: body }
            : { data: toBase64(body), dataType: 'file' as const }),
      });
      // The native request can't be cancelled; the core stops waiting for it all the same.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${url} didn't answer within ${timeout / 1000} s`)),
          timeout,
        );
      });
      try {
        const response = await Promise.race([request, late]);
        const received = Object.fromEntries(
          Object.entries(response.headers).map(([name, value]) => [name.toLowerCase(), value]),
        );
        return {
          url: response.url || url,
          status: response.status,
          headers: received,
          body: responseBytes(response.data, response.status, received['content-type']),
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

interface RenderPlugin {
  render(options: {
    url: string;
    waitFor?: string;
    timeout: number;
    userAgent?: string;
  }): Promise<{ url: string; status: number; html: string }>;
  openWindow(options: { url: string; title: string }): Promise<void>;
}

/** The app's off-screen WebView (apps/mobile: RenderPlugin.java). */
const Render = registerPlugin<RenderPlugin>('Render');

export function capacitorRenderer(): PageRenderer {
  return {
    render: (request) =>
      Render.render({
        url: request.url,
        timeout: request.timeout,
        ...(request.userAgent ? { userAgent: request.userAgent } : {}),
        ...(request.waitFor ? { waitFor: request.waitFor } : {}),
      }),
  };
}

/** Opens a site's page (its sign-in page) full screen; resolves once the reader closes it. */
export const openSiteWindow = (url: string, title: string): Promise<void> =>
  Render.openWindow({ url, title });
