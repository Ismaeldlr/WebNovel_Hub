// What the Windows app gives the core and the page: SQLite and the other native pieces
// through the shell's commands (apps/desktop/src-tauri), HTTP through Tauri's HTTP plugin.
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { fetch } from '@tauri-apps/plugin-http';
import type { HttpClient, Notice, PageRenderer, SqlDriver } from '@webnovel-hub/core';
import { fromWire, toWire } from '@webnovel-hub/core/wire';

/** SQLite over the shell's one connection. Values and rows travel as JSON, bytes as base64. */
export function tauriDriver(): SqlDriver {
  return {
    run: async (sql, values, readsRows) =>
      fromWire(await invoke<string>('db_run', { request: toWire({ sql, values, readsRows }) })),
    exec: (sql) => invoke('db_exec', { sql }),
    close: () => Promise.resolve(),
  };
}

/** Requests sent by the shell, outside the page's cross-origin rules. */
export function tauriHttp(): HttpClient {
  return {
    async request({ url, method, headers, body, timeout }) {
      const response = await fetch(url, {
        method,
        headers,
        connectTimeout: timeout,
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

/** Pages rendered in a hidden window that only the sites that need it may load. */
export function tauriRenderer(): PageRenderer {
  return {
    render: (request) =>
      invoke<{ url: string; status: number; html: string }>('render', {
        url: request.url,
        waitFor: request.waitFor ?? null,
        timeout: request.timeout,
        userAgent: request.userAgent ?? null,
      }),
  };
}

/** Opens a site's page (its sign-in page) in a window that shares the render window's cookies. */
export const openSiteWindow = (url: string, title: string): Promise<void> =>
  invoke('open_site_window', { url, title });

/** A system notification, shown only while the window is out of sight. */
export const notify = (notice: Notice): void => {
  void invoke('notify', { title: notice.title, body: notice.body });
};

const toBase64 = async (file: Blob): Promise<string> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(text);
};

/** Asks where to save the file, then saves it; resolves to false when the reader cancels. */
export async function saveFile(file: Blob, fileName: string): Promise<boolean> {
  return invoke<boolean>('save_file', { name: fileName, data: await toBase64(file) });
}

export const appVersion = (): Promise<string> => getVersion();

/** The version a newer release has, or null when this one is the latest. */
export const checkForUpdate = (): Promise<string | null> => invoke<string | null>('check_update');

/** Downloads and installs the newer release; the app restarts into it. */
export const installUpdate = (): Promise<void> => invoke('install_update');
