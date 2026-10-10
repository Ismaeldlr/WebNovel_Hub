import type { CoreRequest, CoreResponse } from '@webnovel-hub/core';
import { describe, expect, it } from 'vitest';
import {
  ApiError,
  CLIENT_MESSAGES,
  apiDownload,
  apiRequest,
  setDispatch,
  uploadFile,
} from './client';

/** Answers every request with `response`, keeping what was asked. */
function answer(response: CoreResponse | Error) {
  const requests: CoreRequest[] = [];
  setDispatch((request) => {
    requests.push(request);
    return response instanceof Error ? Promise.reject(response) : Promise.resolve(response);
  });
  return requests;
}

describe('apiRequest', () => {
  it('sends the path, method and body, and unwraps the envelope', async () => {
    const requests = answer({
      status: 202,
      body: { success: true, data: { jobId: 'j1' }, error: null },
    });
    await expect(
      apiRequest('/import/url', { method: 'POST', body: { url: 'https://x.example' } }),
    ).resolves.toEqual({ jobId: 'j1' });
    expect(requests).toEqual([
      { method: 'POST', path: '/import/url', body: { url: 'https://x.example' } },
    ]);
  });

  it("throws the core's message, status and details for a failure", async () => {
    answer({
      status: 409,
      body: { success: false, data: { novelId: 'n1' }, error: 'Already in your library.' },
    });
    const error = await apiRequest('/import/url', { method: 'POST' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      message: 'Already in your library.',
      data: { novelId: 'n1' },
    });
  });

  it("reports a library that can't be opened with status 0", async () => {
    answer(new Error('the database is locked'));
    const error = await apiRequest('/library').catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 0, message: CLIENT_MESSAGES.network });
    expect((error as ApiError).isNetworkError).toBe(true);
  });

  it('gives up quietly on a cancelled request', async () => {
    answer({ status: 200, body: { success: true, data: null, error: null } });
    const controller = new AbortController();
    controller.abort();
    await expect(apiRequest('/library', { signal: controller.signal })).rejects.not.toBeInstanceOf(
      ApiError,
    );
  });
});

describe('files', () => {
  it('downloads a file the core produces as a Blob', async () => {
    answer({
      status: 200,
      file: { mediaType: 'application/epub+zip', name: 'a.epub', bytes: new Uint8Array([1, 2]) },
    });
    const blob = await apiDownload('/novels/n1/epub');
    expect(blob.type).toBe('application/epub+zip');
    expect(blob.size).toBe(2);
  });

  it('hands a picked file to the core', async () => {
    const requests = answer({ status: 201, body: { success: true, data: { ok: 1 }, error: null } });
    const file = new File([new Uint8Array([80, 75, 3, 4])], 'novel.epub', {
      type: 'application/epub+zip',
    });
    await expect(uploadFile('/import/epub', file)).resolves.toEqual({ ok: 1 });
    expect(requests[0]).toMatchObject({
      method: 'POST',
      path: '/import/epub',
      file: {
        name: 'novel.epub',
        type: 'application/epub+zip',
        bytes: new Uint8Array([80, 75, 3, 4]),
      },
    });
  });
});
