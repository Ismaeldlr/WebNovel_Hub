import type { UpdateRun } from '@webnovel-hub/shared';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { addNovel, fakeApi } from '../../test/fakeApi';
import { renderApp } from '../../test/renderApp';

const signedIn = () => fakeApi();

let runCount = 0;

function run(fields: Partial<UpdateRun> = {}): UpdateRun {
  runCount += 1;
  const threeHoursAgo = Date.now() - 3 * 3600_000;
  return {
    id: `run-${runCount}`,
    trigger: 'scheduled',
    status: 'completed',
    novel: null,
    novelsChecked: 12,
    newChaptersFound: 4,
    errors: [],
    progressMessage: null,
    progressPercent: 100,
    error: null,
    createdAt: new Date(threeHoursAgo).toISOString(),
    startedAt: new Date(threeHoursAgo).toISOString(),
    finishedAt: new Date(threeHoursAgo + 4 * 60_000).toISOString(),
    ...fields,
  };
}

/** The table rows of the runs, in order (the first row is the column headers). */
async function runRows() {
  await screen.findByRole('table');
  return screen.getAllByRole('row').slice(1);
}

describe('Update Jobs', () => {
  it('lists scheduled runs and manual checks with what they found', async () => {
    const api = signedIn();
    const novelId = addNovel(api, { title: 'The Long Road' });
    api.updateRuns = [
      run({
        status: 'running',
        progressMessage: 'Checked 3 / 12',
        progressPercent: 25,
        novelsChecked: 3,
        newChaptersFound: 1,
        finishedAt: null,
      }),
      run({
        trigger: 'manual',
        novel: { id: novelId, title: 'The Long Road' },
        status: 'failed',
        novelsChecked: 1,
        newChaptersFound: 0,
        error: {
          type: 'rate_limited',
          message: 'Royal Road is limiting requests right now. Try again in a few minutes.',
        },
      }),
      run({ novelsChecked: 40, newChaptersFound: 17 }),
    ];
    renderApp('/updates');

    expect(await screen.findByRole('heading', { level: 1, name: 'Update Jobs' })).toBeVisible();
    const [running, manual, done] = await runRows();

    expect(within(running!).getByRole('rowheader')).toHaveTextContent('Scheduled check');
    expect(running).toHaveTextContent('Running');
    expect(running).toHaveTextContent('Checked 3 / 12');

    expect(within(manual!).getByRole('rowheader')).toHaveTextContent('Check of The Long Road');
    expect(within(manual!).getByRole('link', { name: 'The Long Road' })).toHaveAttribute(
      'href',
      `/novels/${novelId}`,
    );
    expect(manual).toHaveTextContent('Failed');
    expect(manual).toHaveTextContent('Royal Road is limiting requests right now.');

    expect(done).toHaveTextContent('Done');
    expect(done).toHaveTextContent('3 hours ago');
    expect(done).toHaveTextContent('took 4 minutes');
    const cells = within(done!)
      .getAllByRole('cell')
      .map((cell) => cell.textContent);
    expect(cells.slice(-2)).toEqual(['40', '17']);
  });

  it("opens a scheduled run's failed novels", async () => {
    const api = signedIn();
    const lost = addNovel(api, { title: 'A Lost Novel' });
    const changed = addNovel(api, { title: 'A Changed Novel' });
    api.updateRuns = [
      run({
        errors: [
          {
            novelId: lost,
            title: 'A Lost Novel',
            type: 'network_error',
            message: "We couldn't reach Royal Road to check for new chapters.",
          },
          {
            novelId: changed,
            title: 'A Changed Novel',
            type: 'structure_changed',
            message: "Royal Road changed its page layout, so we couldn't read the chapter list.",
          },
        ],
      }),
    ];
    const { user } = renderApp('/updates');

    const toggle = await screen.findByRole('button', { name: '2 novels of yours failed' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list', { name: 'Novels whose check failed' })).toBeNull();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const list = screen.getByRole('list', { name: 'Novels whose check failed' });
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent(
      "A Lost NovelWe couldn't reach Royal Road to check for new chapters.",
    );
    expect(items[1]).toHaveTextContent(
      "A Changed NovelRoyal Road changed its page layout, so we couldn't read the chapter list.",
    );
    expect(within(list).getByRole('link', { name: 'A Lost Novel' })).toHaveAttribute(
      'href',
      `/novels/${lost}`,
    );

    await user.click(toggle);
    expect(screen.queryByRole('list', { name: 'Novels whose check failed' })).toBeNull();
  });

  it('pages through a long history', async () => {
    const api = signedIn();
    api.updateRuns = Array.from({ length: 23 }, () => run());
    const { user } = renderApp('/updates');

    expect(await screen.findByText('Showing 20 of 23 checks')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Showing 23 of 23 checks')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('explains an empty history', async () => {
    signedIn();
    renderApp('/updates');
    expect(await screen.findByRole('heading', { name: 'No checks yet' })).toBeVisible();
  });
});
