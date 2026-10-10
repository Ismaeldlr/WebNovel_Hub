import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { addNovel, addRead, fakeApi } from '../../test/fakeApi';
import { renderApp } from '../../test/renderApp';

/** Two novels read over several days, one of them (Ashen Sky) in the library. */
function seeded() {
  const api = fakeApi();
  const ashen = addNovel(api, {
    title: 'Ashen Sky',
    chapters: 20,
    library: { lastReadChapterNumber: 4, furthestChapterNumber: 6 },
  });
  const brass = addNovel(api, { title: 'Brass Harbor', author: 'Other Author', chapters: 5 });
  addRead(api, ashen, 1, { daysAgo: 40 });
  addRead(api, ashen, 2, { daysAgo: 3, time: '23:50' });
  addRead(api, brass, 1, { daysAgo: 1, time: '21:00' });
  addRead(api, ashen, 3, { daysAgo: 0, time: '00:10' });
  addRead(api, ashen, 4, { daysAgo: 0, time: '00:20' });
  return { api, ashen, brass };
}

const location = () => screen.getByTestId('location').textContent ?? '';
const summary = () => within(screen.getByRole('region', { name: 'History summary' }));

describe('Reading History', () => {
  it('groups chapters by day, newest first, with links to the reader and the novel', async () => {
    const { ashen } = seeded();
    renderApp('/history');

    expect(await screen.findByRole('heading', { level: 2, name: 'Today' })).toBeVisible();
    expect(summary().getByText('Chapters read').nextSibling).toHaveTextContent('5');
    expect(summary().getByText('Novels').nextSibling).toHaveTextContent('2');
    expect(summary().getByText('Authors').nextSibling).toHaveTextContent('2');

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings.slice(0, 2)).toEqual(['Today', 'Yesterday']);
    expect(headings).toHaveLength(4); // today, yesterday, three days ago, forty days ago

    const today = screen.getByRole('region', { name: 'Today' });
    const links = within(today).getAllByRole('link', { name: /Chapter/ });
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      `/reader/${ashen}/4`,
      `/reader/${ashen}/3`,
    ]);
    expect(within(today).getAllByRole('link', { name: 'Ashen Sky' })[0]).toHaveAttribute(
      'href',
      `/novels/${ashen}`,
    );
  });

  it('loads more history a page at a time', async () => {
    const { api } = seeded();
    api.historyPageSize = 2;
    const { user } = renderApp('/history');

    await screen.findByRole('heading', { level: 2, name: 'Today' });
    expect(screen.queryByRole('heading', { level: 2, name: 'Yesterday' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Yesterday' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(4));
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('keeps the range and the novel filter in the address, and filters with its own search', async () => {
    const { brass } = seeded();
    const { user } = renderApp('/history');
    await screen.findByRole('heading', { level: 2, name: 'Today' });

    await user.selectOptions(screen.getByRole('combobox', { name: 'Range' }), 'Last 7 days');
    await waitFor(() => expect(location()).toBe('/history?range=7d'));
    await waitFor(() => expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3));

    await user.click(screen.getByRole('button', { name: 'Novel All novels' }));
    const panel = screen.getByRole('group', { name: 'Filter by novel' });
    await user.type(within(panel).getByRole('searchbox', { name: 'Search your novels' }), 'other');
    await waitFor(() =>
      expect(within(panel).queryByRole('button', { name: /Ashen Sky/ })).not.toBeInTheDocument(),
    );
    await user.click(within(panel).getByRole('button', { name: /Brass Harbor/ }));

    await waitFor(() => expect(location()).toBe(`/history?range=7d&novel=${brass}`));
    expect(await screen.findByRole('button', { name: 'Novel Brass Harbor' })).toHaveFocus();
    await waitFor(() => expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1));
    expect(screen.getByRole('heading', { level: 2, name: 'Yesterday' })).toBeVisible();
    expect(summary().getByText('Novels').nextSibling).toHaveTextContent('1');
  });

  it('shows each novel with its reads, progress and Continue', async () => {
    const { ashen, brass } = seeded();
    const { user } = renderApp('/history?view=novels');

    const ashenRow = await screen.findByRole('article', { name: 'Ashen Sky' });
    expect(within(ashenRow).getByText('4 chapters read')).toBeVisible();
    expect(within(ashenRow).getByRole('progressbar')).toHaveAttribute(
      'aria-valuetext',
      'Chapter 6 of 20',
    );
    expect(
      within(ashenRow).getByRole('link', { name: 'Continue reading Ashen Sky' }),
    ).toHaveAttribute('href', `/reader/${ashen}/4`);

    const brassRow = screen.getByRole('article', { name: 'Brass Harbor' });
    expect(within(brassRow).getByText('1 chapter read · Not in your library')).toBeVisible();
    expect(
      within(brassRow).getByRole('link', { name: 'Continue reading Brass Harbor' }),
    ).toHaveAttribute('href', `/reader/${brass}/1`);

    // No novel filter in this view; back to chapters keeps the range.
    expect(screen.queryByRole('button', { name: /^Novel/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'By chapter' }));
    await waitFor(() => expect(location()).toBe('/history'));
  });

  it('explains an empty history, and an empty range', async () => {
    const api = fakeApi();
    const { user } = renderApp('/history?range=7d');
    expect(await screen.findByRole('heading', { name: 'Nothing read here' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Show all history' }));
    expect(await screen.findByRole('heading', { name: 'No reading history yet' })).toBeVisible();
    expect(api.calls).toContain('GET /history?range=all');
  });
});
