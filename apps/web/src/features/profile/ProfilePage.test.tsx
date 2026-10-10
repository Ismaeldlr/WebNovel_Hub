import type { Profile } from '@webnovel-hub/shared';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { addNovel, fakeApi } from '../../test/fakeApi';
import { renderApp } from '../../test/renderApp';

const day = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);

function withProfile() {
  const api = fakeApi();
  const ashen = addNovel(api, { title: 'Ashen Sky', chapters: 1200 });
  const brass = addNovel(api, { title: 'Brass Harbor', chapters: 40 });
  const summaryOf = (id: string) => {
    const novel = api.novels.get(id)?.novel;
    if (!novel) throw new Error('no novel');
    return { ...novel, library: undefined };
  };
  const profile: Profile = {
    timezone: 'UTC',
    totals: {
      chaptersRead: 42,
      novelsRead: 2,
      authorsRead: 2,
      wordsRead: 123_456,
      readingDays: 12,
      reads: 50,
    },
    streaks: { current: 4, longest: 9, lastReadDate: day(0) },
    activity: Array.from({ length: 90 }, (_, index) => ({
      date: day(89 - index),
      chapters: index === 89 ? 6 : index === 88 ? 3 : index === 10 ? 1 : 0,
    })),
    library: {
      total: 3,
      byStatus: { reading: 2, following: 0, on_hold: 0, dropped: 0, completed: 1 },
      bySource: [
        { source: { key: 'royal_road', name: 'Royal Road' }, count: 2 },
        { source: { key: 'epub', name: 'EPUB' }, count: 1 },
      ],
    },
    mostRead: [
      { novel: summaryOf(ashen), chaptersRead: 30 },
      { novel: summaryOf(brass), chaptersRead: 12 },
    ],
    longestNovel: { novel: summaryOf(ashen), chaptersRead: 30 },
  };
  api.profile = profile;
  return { api, ashen };
}

const tiles = () => within(screen.getByRole('region', { name: 'Reading statistics' }));

describe('Profile', () => {
  it('shows the headline numbers, streaks, activity and breakdowns', async () => {
    const { ashen } = withProfile();
    const { user } = renderApp('/profile');

    expect(await screen.findByRole('region', { name: 'Reading statistics' })).toBeVisible();
    expect(tiles().getByText('Chapters read').nextSibling).toHaveTextContent('42');
    expect(tiles().getByText('Words read').nextSibling).toHaveTextContent('123.5K');
    expect(tiles().getByText('Current streak').nextSibling).toHaveTextContent(
      '4 daysLongest: 9 days',
    );
    expect(tiles().getByText('Per reading day').nextSibling).toHaveTextContent('3.5');

    const heatmap = screen.getByRole('img', { name: /Reading activity/ });
    expect(heatmap).toHaveAccessibleName(
      'Reading activity: 10 chapters on 3 days of the last 90 days.',
    );
    expect(heatmap.querySelector('[data-today]')).toHaveAttribute('title', 'Today: 6 chapters');
    expect(heatmap.querySelector('[data-today]')).toHaveAttribute('data-level', '4');

    await user.click(screen.getByRole('button', { name: 'Show as a table' }));
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows.map((row) => row.textContent)).toEqual([
      'DayChapters',
      'Today6',
      'Yesterday3',
      expect.stringMatching(/1$/),
    ]);

    const status = within(screen.getByRole('region', { name: 'Library by status' }));
    expect(status.getByText('Reading').nextSibling).toHaveTextContent('2 novels');
    expect(status.getByText('Completed').nextSibling).toHaveTextContent('1 novel');
    const source = within(screen.getByRole('region', { name: 'Library by source' }));
    expect(source.getByText('EPUB').nextSibling).toHaveTextContent('1 novel');

    const mostRead = within(screen.getByRole('region', { name: 'Most read' }));
    expect(mostRead.getByRole('link', { name: 'Ashen Sky' })).toHaveAttribute(
      'href',
      `/novels/${ashen}`,
    );
    expect(
      mostRead.getByRole('link', { name: 'Ashen Sky' }).parentElement?.nextSibling,
    ).toHaveTextContent('30 chapters read');
    expect(
      within(screen.getByRole('region', { name: 'Longest novel' })).getByText(
        "1,200 chapters, of which you've read 30.",
      ),
    ).toBeVisible();
  });

  it('shows a new reader empty statistics', async () => {
    fakeApi();
    renderApp('/profile');
    expect(await screen.findByText('Nothing read yet.')).toBeVisible();
    expect(tiles().getByText('Current streak').nextSibling).toHaveTextContent('0 days');
    expect(screen.queryByRole('button', { name: 'Show as a table' })).not.toBeInTheDocument();
  });
});
