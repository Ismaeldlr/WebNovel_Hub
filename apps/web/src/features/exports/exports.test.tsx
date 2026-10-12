import type { FullFetch } from '@webnovel-hub/shared';
import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIENT_MESSAGES } from '../../api/client';
import { type FakeApi, addNovel, fakeApi } from '../../test/fakeApi';
import { chooseMore, openMore } from '../../test/novelMenu';
import { renderApp } from '../../test/renderApp';

const signedIn = () => fakeApi();

/** The files handed to the browser to save (jsdom can't save or make object URLs). */
let saved: { name: string; file: Blob }[];

beforeEach(() => {
  saved = [];
  const files = new Map<string, Blob>();
  URL.createObjectURL = (file: Blob | MediaSource) => {
    const url = `blob:test/${files.size}`;
    files.set(url, file as Blob);
    return url;
  };
  URL.revokeObjectURL = () => undefined;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    const file = files.get(this.href);
    if (file) saved.push({ name: this.download, file });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function fetchAll(api: FakeApi, novelId: string, change: Partial<FullFetch>) {
  api.fullFetches.set(novelId, {
    id: `fetch-all-${novelId}`,
    status: 'pending',
    progressMessage: null,
    progressPercent: null,
    queuedBehind: 0,
    error: null,
    canCancel: true,
    result: null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    ...change,
  });
}

describe('exporting a novel as an EPUB file', () => {
  it('exports the stored chapters from the novel page, saying some are missing', async () => {
    const api = signedIn();
    const id = addNovel(api, { title: 'The Long Road', chapters: 4, fetched: [1, 2] });
    const { user } = renderApp(`/novels/${id}`);

    await chooseMore(user, 'Export EPUB');

    expect(await screen.findByText('Exported The Long Road.epub')).toBeVisible();
    expect(screen.getByText('It holds the 2 of 4 chapters stored so far.')).toBeVisible();
    expect(saved.map((file) => file.name)).toEqual(['The Long Road.epub']);
    expect(await saved[0]?.file.text()).toBe('EPUB of The Long Road: 2 chapters');
    expect(api.calls).toContain(`GET /novels/${id}/epub`);
  });

  it('offers no export before a chapter is stored', async () => {
    const api = signedIn();
    const id = addNovel(api, { title: 'Nothing Yet', chapters: 3 });
    const { user } = renderApp(`/novels/${id}`);
    const menu = await openMore(user);
    expect(await within(menu).findByRole('menuitem', { name: 'Fetch all chapters' })).toBeVisible();
    expect(within(menu).queryByRole('menuitem', { name: /Export EPUB/ })).toBeNull();
  });

  it('exports an EPUB import too, whose chapters all came with the file', async () => {
    const api = signedIn();
    const id = addNovel(api, { title: 'From a File', chapters: 2, fetched: [1, 2], epub: true });
    const { user } = renderApp(`/novels/${id}`);
    await chooseMore(user, 'Export EPUB');
    expect(await screen.findByText('Exported From a File.epub')).toBeVisible();
    const menu = await openMore(user);
    expect(within(menu).queryByRole('menuitem', { name: 'Fetch all chapters' })).toBeNull();
  });

  it("says so when the file can't be downloaded", async () => {
    const api = signedIn();
    const id = addNovel(api, { title: 'Offline Road', chapters: 2, fetched: [1, 2] });
    const { user } = renderApp(`/novels/${id}`);
    const menu = await openMore(user);
    const item = await within(menu).findByRole('menuitem', { name: 'Export EPUB' });

    api.unreachable = true;
    await user.click(item);

    expect(await screen.findByText("Couldn't export the EPUB")).toBeVisible();
    expect(screen.getByText(CLIENT_MESSAGES.network)).toBeVisible();
    expect(saved).toEqual([]);
  });
});

describe('the Exports page', () => {
  it('lists the novels asked for, how far each fetch is, and exports the finished ones', async () => {
    const api = signedIn();
    const fetching = addNovel(api, { title: 'Still Coming', chapters: 5, fetched: [1, 2] });
    const done = addNovel(api, { title: 'All Here', chapters: 3, fetched: [1, 2, 3] });
    addNovel(api, { title: 'Never Asked', chapters: 3, fetched: [1] });
    fetchAll(api, done, {
      status: 'completed',
      result: { fetched: 3, failed: 0 },
      createdAt: '2026-09-29T10:00:00.000Z',
    });
    fetchAll(api, fetching, { status: 'running', progressMessage: 'Fetched 2 of 5 chapters' });
    const { user } = renderApp('/exports');

    const rows = await screen.findAllByRole('article');
    expect(rows.map((row) => within(row).getByRole('heading').textContent)).toEqual([
      'Still Coming',
      'All Here',
    ]);
    const [first, second] = rows as [HTMLElement, HTMLElement];
    expect(within(first).getByText('Fetched 2 of 5 chapters')).toBeVisible();
    expect(
      within(first).getByRole('progressbar', { name: 'Fetching all chapters' }),
    ).toHaveAttribute('aria-valuenow', '2');
    expect(within(first).getByRole('button', { name: 'Stop' })).toBeVisible();
    // The list has no room for the note about pacing.
    expect(screen.queryByText(/isn't overwhelmed/)).toBeNull();
    expect(within(second).getByText('All 3 chapters are stored.')).toBeVisible();

    await user.click(within(second).getByRole('button', { name: 'Export EPUB of All Here' }));
    expect(await screen.findByText('Exported All Here.epub')).toBeVisible();
    expect(await saved[0]?.file.text()).toBe('EPUB of All Here: 3 chapters');
  });

  it('explains how to add a novel when none was asked for', async () => {
    signedIn();
    renderApp('/exports');
    expect(await screen.findByRole('heading', { name: 'Nothing to export yet' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Go to My Library' })).toHaveAttribute(
      'href',
      '/library',
    );
  });
});
