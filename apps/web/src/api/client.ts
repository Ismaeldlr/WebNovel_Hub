import type { CoreRequest, CoreResponse, Method } from '@webnovel-hub/core';
import type { ApiResponse } from '@webnovel-hub/shared';
import { getCore } from '../app/core';

export const CLIENT_MESSAGES = {
  network: "Webnovel Hub couldn't open your library. Restart the app and try again.",
  unexpected: 'Something went wrong. Please try again.',
} as const;

/**
 * A failed call. `message` is always safe to show: the app's message for the reader, or
 * one of CLIENT_MESSAGES. `status` is 0 when the library couldn't be reached at all.
 * `data` holds the details a few failures carry, e.g. an `ImportConflict`.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly data: unknown;

  constructor(status: number, message: string, options?: ErrorOptions & { data?: unknown }) {
    super(message, options);
    this.name = 'ApiError';
    this.status = status;
    this.data = options?.data ?? null;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

type Dispatch = (request: CoreRequest) => Promise<CoreResponse>;

let dispatchTo: Dispatch = async (request) => (await getCore()).dispatch(request);

/** Tests answer requests with a stand-in instead of the app's core. */
export function setDispatch(dispatch: Dispatch): void {
  dispatchTo = dispatch;
}

async function send(request: CoreRequest, signal?: AbortSignal): Promise<CoreResponse> {
  let response: CoreResponse;
  try {
    response = await dispatchTo(request);
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(0, CLIENT_MESSAGES.network, { cause: error });
  }
  signal?.throwIfAborted(); // a cancelled request isn't a failure to report
  return response;
}

/** `data` of a successful envelope; otherwise an ApiError. */
function unwrap<T>(status: number, envelope: ApiResponse<unknown, unknown>): T {
  if (status >= 200 && status < 300 && envelope.success) return envelope.data as T;
  const message = envelope.success ? CLIENT_MESSAGES.unexpected : envelope.error;
  throw new ApiError(status, message, { data: envelope.success ? null : envelope.data });
}

export interface RequestOptions {
  method?: Method;
  body?: unknown;
  signal?: AbortSignal;
}

/** Asks the app's core and unwraps the envelope: `data` on success, an ApiError otherwise. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;
  const response = await send({ method, path, body }, signal);
  if ('file' in response) throw new ApiError(response.status, CLIENT_MESSAGES.unexpected);
  return unwrap<T>(response.status, response.body);
}

/** A file the core produces, e.g. an exported EPUB or a cover. A refusal is an ApiError. */
export async function apiDownload(path: string, signal?: AbortSignal): Promise<Blob> {
  const response = await send({ method: 'GET', path }, signal);
  if ('file' in response) {
    const { bytes, mediaType } = response.file;
    return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mediaType });
  }
  return unwrap<Blob>(response.status, response.body);
}

export interface UploadOptions {
  signal?: AbortSignal;
}

/** Hands a picked file to the core and unwraps the envelope like apiRequest. */
export async function uploadFile<T>(
  path: string,
  file: File,
  options: UploadOptions = {},
): Promise<T> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  options.signal?.throwIfAborted();
  const response = await send(
    { method: 'POST', path, file: { name: file.name, type: file.type, bytes } },
    options.signal,
  );
  if ('file' in response) throw new ApiError(response.status, CLIENT_MESSAGES.unexpected);
  return unwrap<T>(response.status, response.body);
}
