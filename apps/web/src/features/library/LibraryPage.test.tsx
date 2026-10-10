import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { addNovel, fakeApi } from '../../test/fakeApi';
import { renderApp } from '../../test/renderApp';
import { media } from '../../test/setup';

const signedIn = () => fakeApi();

async function card(title: string) {
  return screen.findByRole('article', { name: title });
}

describe('My Library', () => {
  it('shows each novel as a card with its source, status, progress and NEW count', async () => {
    const api = signedIn();
    addNovel(api, {
      title: 'The Long Road',
      chapters: 20,
      newChapters: [19, 20],
      library: {
        lastReadChapterNumber: 3,
        furthestChapterNumber: 5,
        lastReadAt: '2026-09-26T09:00:00Z',
      },
    });
    renderApp('/library');

    const longRoad = await card('The Long Road');
    expect(within(longRoad).getByRole('link', { name: 'The Long Road' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/novels\/novel-\d+$/),
    );
    expect(within(longRoad).getByText('Royal Road')).toBeVisible();
    expect(within(longRoad).getByText('2 new chapters')).toBeVisible();
    expect(within(longRoad).getByText('Ch. 5 / 20')).toBeVisible();
    expect(
      within(longRoad).getByRole('progressbar', { name: 'Reading progress of The Long Road' }),
    ).toHaveAttribute('aria-valuetext', 'Chapter 5 of 20');
    expect(within(longRoad).getByRole('combobox', { name: 'Status of The Long Road' })).toHaveValue(
      'reading',
    );
    expect(
      within(longRoad).getByRole('button', { name: 'Favorite: The Long Road' }),
    ).toHaveAttribute('aria-pressed', 'false');
    // Continue goes to the last chapter read.
    expect(
      within(longRoad).getByRole('link', { name: 'Continue The Long Road, chapter 3' }),
    ).toHaveAttribute('href', expect.stringMatching(/\/reader\/novel-\d+\/3$/));

    const summary = screen.getByRole('region', { name: 'Library summary' });
    expect(within(summary).getByText('Novels').nextSibling).toHaveTextContent('1');
    expect(within(summary).getByText('New chapters').nextSibling).toHaveTextContent('2');
    // The sidebar counts unread NEW chapters too, in words for screen readers.
    const libraryLink = await screen.findByRole('link', { name: 'My Library, 2 new chapters' });
    expect(libraryLink).toHaveTextContent('2');
  });

  it('changes the status and the favorite, and keeps them', async () => {
    const api = signedIn();
    const id = addNovel(api, { title: 'Sky Pride', library: {} });
    const { user } = renderApp('/library');
    const skyPride = await card('Sky Pride');

    await user.selectOptions(
      within(skyPride).getByRole('combobox', { name: 'Status of Sky Pride' }),
      'on_hold',
    );
    await user.click(within(skyPride).getByRole('button', { name: 'Favorite: Sky Pride' }));
    await waitFor(() =>
      expect(api.library.get(id)).toMatchObject({ status: 'on_hold', isFavorite: true }),
    );
    expect(within(skyPride).getByRole('combobox', { name: 'Status of Sky Pride' })).toHaveValue(
      'on_hold',
    );
    expect(within(skyPride).getByRole('button', { name: 'Favorite: Sky Pride' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(api.calls).toContain(`PATCH /library/${id}/status`);
    expect(api.calls).toContain(`PATCH /library/${id}/favorite`);
  });

  it('asks before removing a novel, and removes only after confirming', async () => {
    const api = signedIn();
    const id = addNovel(api, { title: 'Invisible Dragon', library: {} });
    addNovel(api, { title: 'Kept Novel', library: {} });
    const { user } = renderApp('/library');

    const dragon = await card('Invisible Dragon');
    await user.click(within(dragon).getByRole('button', { name: 'Delete Invisible Dragon' }));
    const dialog = screen.getByRole('dialog', {
      name: 'Delete “Invisible Dragon”?',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(api.library.has(id)).toBe(true);

    await user.click(within(dragon).getByRole('button', { name: 'Delete Invisible Dragon' }));
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(screen.queryByRole('article', { name: 'Invisible Dragon' })).toBeNull(),
    );
    expect(api.library.has(id)).toBe(false);
    expect(screen.getByText('“Invisible Dragon” was deleted.')).toBeVisible();
    expect(screen.getByRole('article', { name: 'Kept Novel' })).toBeVisible();
  });

  it('loads more novels on request', async () => {
    const api = signedIn();
    for (let index = 0; index < 30; index += 1)
      addNovel(api, { title: `Book ${index}`, library: {} });
    const { user } = renderApp('/library');

    await screen.findByText('Showing 24 of 30 novels');
    expect(screen.getAllByRole('article')).toHaveLength(24);
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByText('Showing 30 of 30 novels');
    expect(screen.getAllByRole('article')).toHaveLength(30);
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('invites the reader to add a novel when the library is empty', async () => {
    signedIn();
    renderApp('/library');
    expect(await screen.findByRole('heading', { name: 'Your shelves are empty' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Add a novel' })).toHaveAttribute('href', '/add');
    // Nothing to filter on empty shelves.
    expect(screen.queryByRole('region', { name: 'Filter and sort your library' })).toBeNull();
  });
});

describe('Library filters, sort and search', () => {
  const location = () => screen.getByTestId('location').textContent;
  const titles = () =>
    screen
      .queryAllByRole('article')
      .map((article) => within(article).getByRole('heading', { level: 3 }).textContent);
  const filterBar = () => screen.getByRole('region', { name: 'Filter and sort your library' });
  const control = (name: string) => within(filterBar()).getByRole('combobox', { name });
  const summary = () => within(filterBar()).getByRole('status');
  const statusTab = (name: string) =>
    within(screen.getByRole('tablist', { name: 'Status' })).getByRole('tab', { name });

  /** Four novels in last-read order: Mother, Lord, Sky, Aura. */
  function shelf() {
    const api = signedIn();
    addNovel(api, {
      title: 'Mother of Learning',
      author: 'nobody103',
      chapters: 100,
      latestChapterAt: '2026-01-10T00:00:00Z',
      library: {
        isFavorite: true,
        lastReadChapterNumber: 50,
        furthestChapterNumber: 50,
        lastReadAt: '2026-09-26T09:00:00Z',
      },
    });
    addNovel(api, {
      title: 'Lord of Mysteries',
      author: 'Cuttlefish',
      source: { key: 'wtr_lab', name: 'WTR Lab' },
      chapters: 200,
      newChapters: [199, 200],
      latestChapterAt: '2026-03-01T00:00:00Z',
      library: {
        status: 'following',
        lastReadChapterNumber: 10,
        furthestChapterNumber: 10,
        lastReadAt: '2026-09-25T09:00:00Z',
      },
    });
    addNovel(api, {
      title: 'Sky Pride',
      author: 'Mad Snail',
      latestChapterAt: null,
      library: { status: 'on_hold', addedAt: '2026-09-24T09:00:00Z' },
    });
    addNovel(api, {
      title: 'Aura Overload',
      author: 'Twin Swords',
      chapters: 40,
      latestChapterAt: '2026-02-01T00:00:00Z',
      library: {
        status: 'completed',
        lastReadChapterNumber: 40,
        furthestChapterNumber: 40,
        lastReadAt: '2026-09-20T09:00:00Z',
      },
    });
    return api;
  }

  it('filters by status, source, favourites and unread NEW chapters, in the address', async () => {
    const api = shelf();
    const { user } = renderApp('/library');
    await waitFor(() =>
      expect(titles()).toEqual([
        'Mother of Learning',
        'Lord of Mysteries',
        'Sky Pride',
        'Aura Overload',
      ]),
    );
    expect(summary()).toHaveTextContent('4 novels');

    // The statuses are tabs over the shelves (§5.5).
    expect(statusTab('All')).toHaveAttribute('aria-selected', 'true');
    await user.click(statusTab('Following'));
    await waitFor(() => expect(titles()).toEqual(['Lord of Mysteries']));
    expect(statusTab('Following')).toHaveAttribute('aria-selected', 'true');
    expect(location()).toBe('/library?status=following');
    expect(summary()).toHaveTextContent('1 of 4 novels matches');
    expect(api.calls).toContain('GET /library?status=following&sort=last_read&page=1&limit=24');

    await user.click(statusTab('All'));
    await waitFor(() => expect(location()).toBe('/library'));
    expect(control('Source')).toHaveDisplayValue('All sources');
    await user.selectOptions(control('Source'), 'Royal Road');
    await waitFor(() =>
      expect(titles()).toEqual(['Mother of Learning', 'Sky Pride', 'Aura Overload']),
    );
    expect(location()).toBe('/library?source=royal_road');

    await user.click(within(filterBar()).getByRole('checkbox', { name: 'Favorites only' }));
    await waitFor(() => expect(titles()).toEqual(['Mother of Learning']));
    expect(location()).toBe('/library?source=royal_road&favorite=true');

    // Every filter at once can match nothing: say so, and offer to clear them.
    await user.click(
      within(filterBar()).getByRole('checkbox', { name: 'With unread new chapters' }),
    );
    expect(await screen.findByRole('heading', { name: 'No novels match' })).toBeVisible();
    expect(summary()).toHaveTextContent('0 of 4 novels match');

    const clearButtons = screen.getAllByRole('button', { name: 'Clear filters' });
    await user.click(clearButtons[clearButtons.length - 1] as HTMLElement);
    await waitFor(() => expect(titles()).toHaveLength(4));
    expect(location()).toBe('/library');
    expect(within(filterBar()).getByRole('checkbox', { name: 'Favorites only' })).not.toBeChecked();

    await user.click(
      within(filterBar()).getByRole('checkbox', { name: 'With unread new chapters' }),
    );
    await waitFor(() => expect(titles()).toEqual(['Lord of Mysteries']));
  });

  it('searches titles and authors as you type', async () => {
    const api = shelf();
    const { user } = renderApp('/library');
    const search = await screen.findByRole('searchbox', { name: 'Search titles and authors' });
    await user.type(search, 'snail');
    await waitFor(() => expect(titles()).toEqual(['Sky Pride']));
    expect(location()).toBe('/library?q=snail');
    // One request for the whole word, a moment after typing stopped.
    expect(api.calls.filter((call) => call.startsWith('GET /library?'))).toEqual([
      'GET /library?sort=last_read&page=1&limit=24',
      'GET /library?sort=last_read&q=snail&page=1&limit=24',
    ]);

    await user.clear(search);
    await user.type(search, 'of');
    await waitFor(() => expect(titles()).toEqual(['Mother of Learning', 'Lord of Mysteries']));

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(search).toHaveValue('');
    await waitFor(() => expect(titles()).toHaveLength(4));
  });

  it('sorts by last read, last updated, title, date added and progress', async () => {
    shelf();
    const { user } = renderApp('/library');
    await waitFor(() => expect(titles()).toHaveLength(4));

    const sortBy = async (label: string) => {
      await user.selectOptions(control('Sort by'), label);
      await waitFor(() => expect(control('Sort by')).toHaveDisplayValue(label));
    };
    await sortBy('Title A–Z');
    await waitFor(() =>
      expect(titles()).toEqual([
        'Aura Overload',
        'Lord of Mysteries',
        'Mother of Learning',
        'Sky Pride',
      ]),
    );
    expect(location()).toBe('/library?sort=title');
    // A sort isn't a filter: nothing to clear.
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();

    await sortBy('Last updated');
    await waitFor(() =>
      expect(titles()).toEqual([
        'Lord of Mysteries',
        'Aura Overload',
        'Mother of Learning',
        'Sky Pride',
      ]),
    );
    await sortBy('Progress');
    await waitFor(() =>
      expect(titles()).toEqual([
        'Aura Overload',
        'Mother of Learning',
        'Lord of Mysteries',
        'Sky Pride',
      ]),
    );
  });

  it('keeps both of two changes that land before the page re-renders', async () => {
    shelf();
    renderApp('/library?status=following');
    await waitFor(() => expect(titles()).toEqual(['Lord of Mysteries']));
    act(() => {
      fireEvent.click(statusTab('All'));
      fireEvent.change(control('Sort by'), { target: { value: 'title' } });
    });
    await waitFor(() => expect(location()).toBe('/library?sort=title'));
    await waitFor(() => expect(titles()).toHaveLength(4));
  });

  it('folds the sort and filters behind a button on a phone', async () => {
    media.matches = true; // a phone
    shelf();
    const { user } = renderApp('/library');
    await waitFor(() => expect(titles()).toHaveLength(4));
    expect(within(filterBar()).getByRole('searchbox')).toBeVisible();
    expect(within(filterBar()).queryByRole('combobox', { name: 'Sort by' })).toBeNull();

    const button = within(filterBar()).getByRole('button', { name: 'Sort & filter' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    await user.selectOptions(control('Sort by'), 'Title A–Z');
    await waitFor(() => expect(location()).toBe('/library?sort=title'));
    expect(within(filterBar()).getByRole('checkbox', { name: 'Favorites only' })).toBeVisible();
  });

  it('keeps the filters when coming back to My Library in the same session', async () => {
    shelf();
    const { user } = renderApp('/library');
    await waitFor(() => expect(titles()).toHaveLength(4));
    await user.click(statusTab('Completed'));
    await user.selectOptions(control('Sort by'), 'Title A–Z');
    await waitFor(() => expect(location()).toBe('/library?status=completed&sort=title'));

    await user.click(screen.getByRole('link', { name: 'Reading History' }));
    await screen.findByRole('heading', { level: 1, name: 'Reading History' });
    await user.click(screen.getByRole('link', { name: /^My Library/ }));

    await waitFor(() => expect(location()).toBe('/library?status=completed&sort=title'));
    await waitFor(() => expect(titles()).toEqual(['Aura Overload']));
    expect(statusTab('Completed')).toHaveAttribute('aria-selected', 'true');
    expect(control('Sort by')).toHaveValue('title');
    expect(sessionStorage.getItem('webnovel-hub.library-filters')).toBe(
      'status=completed&sort=title',
    );
  });

  it('restores the session’s filters on a fresh load', async () => {
    shelf();
    sessionStorage.setItem('webnovel-hub.library-filters', 'source=wtr_lab');
    renderApp('/library');
    await waitFor(() => expect(titles()).toEqual(['Lord of Mysteries']));
    expect(location()).toBe('/library?source=wtr_lab');
  });

  it('keeps a changed novel in place under a filter until the list is next loaded', async () => {
    const api = shelf();
    const { user } = renderApp('/library?favorite=true');
    await waitFor(() => expect(titles()).toEqual(['Mother of Learning']));

    const star = screen.getByRole('button', { name: 'Favorite: Mother of Learning' });
    await user.click(star);
    await waitFor(() => expect(star).toHaveAttribute('aria-pressed', 'false'));
    expect(star).toHaveFocus();
    expect(titles()).toEqual(['Mother of Learning']);
    expect(api.library.get('novel-1')?.isFavorite ?? false).toBe(false);

    // The next change of filter loads the list afresh.
    await user.click(within(filterBar()).getByRole('checkbox', { name: 'Favorites only' }));
    await user.click(within(filterBar()).getByRole('checkbox', { name: 'Favorites only' }));
    expect(await screen.findByRole('heading', { name: 'No novels match' })).toBeVisible();
  });
});
