import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { addNovel, fakeApi } from '../../test/fakeApi';
import { chooseMore, openMore } from '../../test/novelMenu';
import { renderApp } from '../../test/renderApp';

const signedIn = () => fakeApi();
// The page polls a running fetch every 3 seconds.
const SLOW = { timeout: 8_000 };

/**
 * Whether the More menu offers "Fetch all chapters", once the stored count has loaded
 * (the menu's other items are there from the start).
 */
async function offersFetchAll(user: UserEvent): Promise<boolean> {
  const menu = await openMore(user);
  await within(menu).findByRole('menuitem', { name: 'Edit details' });
  await new Promise((resolve) => setTimeout(resolve, 50));
  const offered = within(menu).queryByRole('menuitem', { name: 'Fetch all chapters' }) !== null;
  await user.keyboard('{Escape}');
  return offered;
}

describe('fetch all chapters (plan 18)', () => {
  it('fetches every chapter on request, showing progress, then says they are stored', async () => {
    const api = signedIn();
    const id = addNovel(api, { title: 'The Long Road', chapters: 6, fetched: [1], library: {} });
    api.fullFetchScript = [
      { status: 'running', progressMessage: 'Fetched 3 of 6 chapters', stored: 2 },
      { status: 'completed', result: { fetched: 5, failed: 0 } },
    ];
    const { user } = renderApp(`/novels/${id}`);

    await chooseMore(user, 'Fetch all chapters');

    expect(await screen.findByText('Waiting to fetch all chapters…')).toBeVisible();
    // No second request while one waits or runs.
    expect(await offersFetchAll(user)).toBe(false);
    expect(await screen.findByText('Fetched 3 of 6 chapters', {}, SLOW)).toBeVisible();
    const bar = screen.getByRole('progressbar', { name: 'Fetching all chapters' });
    expect(bar).toHaveAttribute('aria-valuenow', '3');
    expect(bar).toHaveAttribute('aria-valuemax', '6');
    expect(screen.getByText(/with long pauses, so Royal Road isn't overwhelmed/)).toBeVisible();

    expect(await screen.findByText('All 6 chapters are stored.', {}, SLOW)).toBeVisible();
    // Nothing left to fetch.
    expect(await offersFetchAll(user)).toBe(false);
    expect(api.calls.filter((call) => call === `POST /novels/${id}/fetch-all`)).toHaveLength(1);
  }, 20_000);

  it('says when other novels from the same site go first', async () => {
    const api = signedIn();
    const id = addNovel(api, { chapters: 4 });
    api.fullFetches.set(id, {
      id: 'fetch-all-queued',
      status: 'pending',
      progressMessage: 'Waiting to start…',
      progressPercent: null,
      queuedBehind: 2,
      error: null,
      canCancel: false,
      result: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
    });
    renderApp(`/novels/${id}`);

    expect(
      await screen.findByText(
        'Waiting to fetch all chapters: Royal Road fetches one novel at a time, and 2 novels go first.',
      ),
    ).toBeVisible();
    // Someone else asked for it: only they can stop it.
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
  });

  it('stops a fetch the reader asked for', async () => {
    const api = signedIn();
    const id = addNovel(api, { chapters: 4, library: {} });
    const { user } = renderApp(`/novels/${id}`);

    await chooseMore(user, 'Fetch all chapters');
    const status = await screen.findByText('Waiting to fetch all chapters…');
    await user.click(
      within(status.closest('[role="status"]') as HTMLElement).getByRole('button', {
        name: 'Stop',
      }),
    );

    expect(await screen.findByText('Stopped fetching all chapters')).toBeVisible();
    expect(api.fullFetches.has(id)).toBe(false);
    const menu = await openMore(user);
    expect(await within(menu).findByRole('menuitem', { name: 'Fetch all chapters' })).toBeVisible();
  });

  it('explains why a fetch stopped', async () => {
    const api = signedIn();
    const id = addNovel(api, { chapters: 4 });
    api.fullFetchScript = [
      {
        status: 'failed',
        error: {
          type: 'rate_limited',
          message:
            'Royal Road kept refusing requests, so fetching stopped. The chapters fetched so far are kept; try again in a few hours for the rest.',
        },
      },
    ];
    const { user } = renderApp(`/novels/${id}`);

    await chooseMore(user, 'Fetch all chapters');

    const heading = await screen.findByText('Fetching all chapters stopped.', {}, SLOW);
    const alert = heading.closest('[role="alert"]');
    expect(alert).toHaveTextContent('Royal Road kept refusing requests');
    // It can be asked for again.
    expect(await offersFetchAll(user)).toBe(true);
  }, 15_000);

  it('is not offered for EPUB imports or novels with every chapter stored', async () => {
    const api = signedIn();
    const epub = addNovel(api, { title: 'From a File', chapters: 3, epub: true });
    const stored = addNovel(api, { title: 'All Here', chapters: 2, fetched: [1, 2] });
    const first = renderApp(`/novels/${epub}`);
    await screen.findByRole('heading', { level: 1, name: 'From a File' });
    expect(await offersFetchAll(first.user)).toBe(false);
    first.unmount();

    const second = renderApp(`/novels/${stored}`);
    await screen.findByRole('heading', { level: 1, name: 'All Here' });
    await screen.findByRole('button', { name: 'Check for updates' });
    expect(await offersFetchAll(second.user)).toBe(false);
    // An EPUB import is asked once how many chapters are stored, for Export EPUB.
    expect(api.calls.filter((call) => call === `GET /novels/${epub}/fetch-all`)).toHaveLength(1);
  });
});
