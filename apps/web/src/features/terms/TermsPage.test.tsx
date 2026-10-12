import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { addNovel, fakeApi } from '../../test/fakeApi';
import { renderApp } from '../../test/renderApp';

function withTerms() {
  const api = fakeApi();
  const world = addNovel(api, { title: 'Martial World', library: {} });
  const novel = (id: string) => {
    const { title } = api.novels.get(id)!.novel;
    return { id, title };
  };
  const made = { createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' };
  api.terms = [
    { id: 't1', novel: novel(world), original: 'Lin Ming', replacement: 'Lynn', ...made },
    { id: 't2', novel: null, original: 'Qi', replacement: 'Chi', ...made },
    { id: 't3', novel: null, original: '[TL note]', replacement: '', ...made },
  ];
  return api;
}

describe('Terms', () => {
  it('opens from the profile and lists the terms by novel, every novel first', async () => {
    withTerms();
    const { user } = renderApp('/profile');
    await user.click(await screen.findByRole('link', { name: 'Terms' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Terms' })).toBeVisible();
    const groups = await within(screen.getByRole('main')).findAllByRole('region');
    expect(groups.map((group) => within(group).getByRole('heading').textContent)).toEqual([
      'Every novel',
      'Martial World',
    ]);
    expect(
      within(groups[0]!)
        .getAllByRole('listitem')
        .map((row) => row.textContent),
    ).toEqual(['[TL note]becomesHiddenEdit', 'QibecomesChiEdit']);
    expect(screen.getByRole('link', { name: 'Martial World' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/novels\//),
    );
  });

  it('searches, edits, deletes and adds terms', async () => {
    const api = withTerms();
    const { user } = renderApp('/profile/terms');
    await user.type(await screen.findByRole('searchbox', { name: 'Search terms' }), 'lynn');
    expect(screen.getByText('1 of 3 terms')).toBeVisible();
    expect(within(screen.getByRole('main')).getAllByRole('region')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Edit term Lin Ming' }));
    const edit = await screen.findByRole('dialog', { name: 'Edit term' });
    const replacement = within(edit).getByLabelText('Show instead');
    await user.clear(replacement);
    await user.type(replacement, 'Lin Ming the Great');
    await user.click(within(edit).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.terms[0]?.replacement).toBe('Lin Ming the Great'));
    expect(api.terms[0]?.novel?.title).toBe('Martial World');

    await user.clear(screen.getByRole('searchbox', { name: 'Search terms' }));
    await user.click(screen.getByRole('button', { name: 'Edit term Qi' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Edit term' })).getByRole('button', {
        name: 'Delete',
      }),
    );
    await waitFor(() => expect(api.terms.map((term) => term.id)).toEqual(['t1', 't3']));

    // Added here, a term is for every novel.
    await user.click(screen.getByRole('button', { name: 'Add term' }));
    const add = await screen.findByRole('dialog', { name: 'Add term' });
    expect(within(add).getByText('This term is used in every novel.')).toBeVisible();
    await user.click(within(add).getByRole('button', { name: 'Save' }));
    expect(await within(add).findByText('Enter the text to replace.')).toBeVisible();
    await user.type(within(add).getByLabelText('Text in the chapters'), 'Dao');
    await user.type(within(add).getByLabelText('Show instead'), 'Way');
    await user.click(within(add).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.terms.at(-1)).toMatchObject({ novel: null, original: 'Dao', replacement: 'Way' }),
    );
  });

  it('explains how to add one when there are none', async () => {
    fakeApi();
    renderApp('/profile/terms');
    expect(await screen.findByRole('heading', { name: 'No terms yet' })).toBeVisible();
  });
});
