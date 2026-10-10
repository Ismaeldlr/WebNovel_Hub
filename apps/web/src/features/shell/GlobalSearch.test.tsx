import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { addNovel, fakeApi } from '../../test/fakeApi';
import { renderApp } from '../../test/renderApp';
import { media } from '../../test/setup';

const location = () => screen.getByTestId('location').textContent;
const SEARCH = { name: 'Search novels by title or author' };
const combobox = () => screen.getByRole('combobox', SEARCH);
const listbox = () => screen.getByRole('listbox', { name: 'Search results', hidden: true });
const options = () =>
  within(listbox())
    .queryAllByRole('option')
    .map((option) => option.textContent);

/** A catalog with seven "Dungeon" novels and two others. */
function catalog() {
  const api = fakeApi();
  const ids = {
    mother: addNovel(api, { title: 'Mother of Learning', author: 'nobody103', library: {} }),
    inn: addNovel(api, { title: 'The Wandering Inn', author: 'pirateaba' }),
  };
  for (let index = 1; index <= 7; index += 1) addNovel(api, { title: `Dungeon ${index}` });
  return { api, ids };
}

const searchCalls = (calls: string[]) => calls.filter((call) => call.startsWith('GET /search'));

describe('global search', () => {
  it('searches from two characters, a moment after typing stops, showing up to five', async () => {
    const { api } = catalog();
    const { user } = renderApp('/library');
    await user.click(await screen.findByRole('combobox', SEARCH));

    await user.keyboard('d');
    expect(combobox()).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard('ungeon');
    await waitFor(() => expect(options()).toHaveLength(6));
    expect(combobox()).toHaveAttribute('aria-expanded', 'true');
    expect(combobox()).toHaveAttribute('aria-controls', listbox().id);
    expect(options()).toEqual([
      expect.stringContaining('Dungeon 1'),
      expect.stringContaining('Dungeon 2'),
      expect.stringContaining('Dungeon 3'),
      expect.stringContaining('Dungeon 4'),
      expect.stringContaining('Dungeon 5'),
      'See all 7 results in your library',
    ]);
    expect(options()[0]).toContain('A. Writer · Royal Road · 10 chapters');
    // One request for the typed word, never one per keystroke or for one character.
    expect(searchCalls(api.calls)).toEqual(['GET /search?q=dungeon']);
    expect(await screen.findByText(/^5 results of 7\./)).toHaveAttribute('role', 'status');
  });

  it('moves through the results with the arrow keys and opens one with Enter', async () => {
    const { ids } = catalog();
    const { user } = renderApp('/library');
    await user.click(await screen.findByRole('combobox', SEARCH));
    await user.keyboard('learning');
    await waitFor(() => expect(options()).toHaveLength(2));
    expect(combobox()).not.toHaveAttribute('aria-activedescendant');

    await user.keyboard('{ArrowDown}');
    const [first, all] = within(listbox()).getAllByRole('option');
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(combobox()).toHaveAttribute('aria-activedescendant', first?.id);
    expect(combobox()).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(all).toHaveAttribute('aria-selected', 'true');
    expect(first).toHaveAttribute('aria-selected', 'false');
    await user.keyboard('{ArrowDown}'); // wraps around
    expect(first).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowUp}');
    expect(all).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowUp}{Enter}');

    await waitFor(() => expect(location()).toBe(`/novels/${ids.mother}`));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mother of Learning' }),
    ).toBeVisible();
    expect(combobox()).toHaveValue('');
    expect(combobox()).toHaveAttribute('aria-expanded', 'false');
  });

  it('goes to the library with the whole search from the last option, or Enter alone', async () => {
    catalog();
    const { user } = renderApp('/library');
    await user.click(await screen.findByRole('combobox', SEARCH));
    await user.keyboard('dungeon');
    await waitFor(() => expect(options()).toHaveLength(6));
    await user.keyboard('{ArrowUp}');
    expect(
      within(listbox()).getByRole('option', { name: 'See all 7 results in your library' }),
    ).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(location()).toBe('/library?q=dungeon'));
    expect(await screen.findByRole('searchbox', { name: 'Search titles and authors' })).toHaveValue(
      'dungeon',
    );

    // Enter without choosing an option searches the library too.
    await user.click(combobox());
    await user.keyboard('wandering{Enter}');
    await waitFor(() => expect(location()).toBe('/library?q=wandering'));
    await waitFor(() =>
      expect(screen.getByRole('searchbox', { name: 'Search titles and authors' })).toHaveValue(
        'wandering',
      ),
    );
  });

  it('closes the list with Escape, then clears the box with a second Escape', async () => {
    catalog();
    const { user } = renderApp('/library');
    await user.click(await screen.findByRole('combobox', SEARCH));
    await user.keyboard('mother');
    await waitFor(() => expect(options()).toHaveLength(2));

    await user.keyboard('{Escape}');
    expect(combobox()).toHaveAttribute('aria-expanded', 'false');
    expect(combobox()).toHaveValue('mother');
    await user.keyboard('{ArrowDown}'); // opens it again
    expect(combobox()).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}{Escape}');
    expect(combobox()).toHaveValue('');
    expect(combobox()).toHaveFocus();

    // Leaving the box closes the list too.
    await user.keyboard('mother');
    await waitFor(() => expect(combobox()).toHaveAttribute('aria-expanded', 'true'));
    await user.tab();
    expect(combobox()).toHaveAttribute('aria-expanded', 'false');
  });

  it('says when nothing matches, and still offers the library', async () => {
    catalog();
    const { user } = renderApp('/library');
    await user.click(await screen.findByRole('combobox', SEARCH));
    await user.keyboard('zzz');
    expect(
      await screen.findByText('No novels match “zzz”.', { selector: 'p:not([role])' }),
    ).toBeVisible();
    expect(options()).toEqual(['See all results in your library']);
  });

  it('opens a result with a click', async () => {
    const { ids } = catalog();
    const { user } = renderApp('/library');
    await user.click(await screen.findByRole('combobox', SEARCH));
    await user.keyboard('pirate');
    await user.click(await screen.findByRole('option', { name: /The Wandering Inn/ }));
    await waitFor(() => expect(location()).toBe(`/novels/${ids.inn}`));
  });

  it('opens over the top bar on phones, and closes back to its button', async () => {
    media.matches = true; // every media query matches: a phone
    const { ids } = catalog();
    const { user } = renderApp('/library');

    const button = await screen.findByRole('button', { name: 'Search' });
    expect(screen.queryByRole('combobox', SEARCH)).toBeNull();
    await user.click(button);
    expect(combobox()).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Close search' }));
    expect(screen.queryByRole('combobox', SEARCH)).toBeNull();
    expect(button).toHaveFocus();

    await user.keyboard('{Enter}');
    await user.keyboard('mother');
    await waitFor(() => expect(options()).toHaveLength(2));
    await user.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => expect(location()).toBe(`/novels/${ids.mother}`));
    expect(screen.queryByRole('combobox', SEARCH)).toBeNull();

    // Escape on an empty box closes it.
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('combobox', SEARCH)).toBeNull();
  });
});
