import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { addNovel, addShelf, fakeApi } from '../../test/fakeApi';
import { renderApp } from '../../test/renderApp';

const location = () => screen.getByTestId('location').textContent;
const titles = () =>
  screen
    .queryAllByRole('article')
    .map((article) => within(article).getByRole('heading', { level: 3 }).textContent);
const shelfTabs = () => within(screen.getByRole('tablist', { name: 'Shelves' }));

function shelf() {
  const api = fakeApi();
  const comfy = addShelf(api, '✨ Comfy');
  const a = addNovel(api, { title: 'Alpha', library: { shelfIds: [comfy.id] } });
  const b = addNovel(api, { title: 'Beta', library: {} });
  const c = addNovel(api, { title: 'Gamma', library: { hidden: true } });
  return { api, comfy, a, b, c };
}

describe('Shelves in My Library', () => {
  it('shows nothing extra without shelves or hidden novels', async () => {
    const api = fakeApi();
    addNovel(api, { title: 'Alpha', library: {} });
    renderApp('/library');
    await waitFor(() => expect(titles()).toEqual(['Alpha']));
    expect(screen.queryByRole('tablist', { name: 'Shelves' })).toBeNull();
  });

  it('switches between the whole library, a shelf and the hidden novels', async () => {
    const { comfy } = shelf();
    const { user } = renderApp('/library');
    // Hidden novels stay out of the whole library.
    await waitFor(() => expect(titles().sort()).toEqual(['Alpha', 'Beta']));
    expect(shelfTabs().getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');

    await user.click(shelfTabs().getByRole('tab', { name: '✨ Comfy' }));
    await waitFor(() => expect(titles()).toEqual(['Alpha']));
    expect(location()).toBe(`/library?shelf=${comfy.id}`);

    await user.click(shelfTabs().getByRole('tab', { name: 'Hidden' }));
    await waitFor(() => expect(titles()).toEqual(['Gamma']));
  });

  it('says how to fill an empty shelf', async () => {
    const api = fakeApi();
    addNovel(api, { title: 'Alpha', library: {} });
    const empty = addShelf(api, 'Later');
    renderApp(`/library?shelf=${empty.id}`);
    expect(await screen.findByRole('heading', { name: 'Nothing on Later yet' })).toBeVisible();
  });

  it('makes, renames, moves and deletes shelves', async () => {
    const { api, comfy } = shelf();
    const { user } = renderApp('/library');
    await user.click(await screen.findByRole('button', { name: 'Edit shelves' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Shelves' }));

    await user.type(dialog.getByRole('textbox', { name: 'New shelf' }), 'Re-reads{Enter}');
    await waitFor(() =>
      expect(api.shelves.map((each) => each.name)).toEqual(['✨ Comfy', 'Re-reads']),
    );

    const name = await dialog.findByRole('textbox', { name: 'Name of “Re-reads”' });
    await user.clear(name);
    await user.type(name, 'Favourites{Enter}');
    await waitFor(() => expect(api.shelves[1]?.name).toBe('Favourites'));

    await user.click(dialog.getByRole('button', { name: 'Move “Favourites” up' }));
    await waitFor(() =>
      expect(api.shelves.map((each) => each.name)).toEqual(['Favourites', '✨ Comfy']),
    );

    await user.click(dialog.getByRole('button', { name: 'Delete “✨ Comfy”' }));
    expect(dialog.getByText(/Its 1 novel stay in your library/)).toBeVisible();
    await user.click(dialog.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.shelves.map((each) => each.id)).not.toContain(comfy.id));
    expect(api.library.size).toBe(3);
  });
});

describe("A novel's shelves and hiding", () => {
  it('puts the novel on shelves from its page, a new one too', async () => {
    const { api, comfy, b } = shelf();
    const { user } = renderApp(`/novels/${b}`);
    await user.click(await screen.findByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Shelves…' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Shelves' }));

    await user.click(await dialog.findByRole('checkbox', { name: /✨ Comfy/ }));
    await waitFor(() => expect(api.library.get(b)?.shelfIds).toEqual([comfy.id]));
    await user.type(dialog.getByRole('textbox', { name: 'New shelf' }), 'Weekend{Enter}');
    await waitFor(() => expect(api.library.get(b)?.shelfIds).toHaveLength(2));
    expect(dialog.getByRole('checkbox', { name: /Weekend/ })).toBeChecked();

    // Off one shelf: still on the other.
    await user.click(dialog.getByRole('checkbox', { name: /✨ Comfy/ }));
    await waitFor(() => expect(api.library.get(b)?.shelfIds).toHaveLength(1));
    await user.click(dialog.getByRole('button', { name: 'Done' }));
    expect(await screen.findByRole('link', { name: 'Weekend: show the shelf' })).toBeVisible();
  });

  it('hides a novel and shows it again, quieting its notifications', async () => {
    const { api, a } = shelf();
    api.library.get(a)!.notify = true;
    const { user } = renderApp(`/novels/${a}`);
    await user.click(await screen.findByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Hide from library' }));
    expect(await screen.findByText('Alpha is hidden')).toBeVisible();
    expect(api.library.get(a)).toMatchObject({
      hidden: true,
      notify: null,
      shelfIds: [expect.any(String)],
    });
    expect(screen.getByRole('button', { name: 'Notify me about new chapters' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await user.click(screen.getByRole('button', { name: 'Show in library' }));
    await waitFor(() => expect(api.library.get(a)?.hidden).toBe(false));
  });
});

describe('Shelves in the sidebar', () => {
  it('stay folded until the arrow opens them, then lead to each shelf', async () => {
    const { comfy } = shelf();
    const { user } = renderApp('/history');
    const toggle = await screen.findByRole('button', { name: 'Shelves' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: /✨ Comfy/ })).toBeNull();

    await user.click(toggle);
    const list = within(screen.getByRole('list', { name: 'Shelves' }));
    expect(await list.findByRole('link', { name: /Hidden/ })).toBeVisible();
    await user.click(list.getByRole('link', { name: /✨ Comfy/ }));
    expect(location()).toBe(`/library?shelf=${comfy.id}`);
    await waitFor(() => expect(titles()).toEqual(['Alpha']));
  });
});
