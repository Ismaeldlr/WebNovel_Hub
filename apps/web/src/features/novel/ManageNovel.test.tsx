import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { addNovel, fakeApi } from '../../test/fakeApi';
import { chooseMore } from '../../test/novelMenu';
import { renderApp } from '../../test/renderApp';
import { COVER_CHECKS } from './manageActions';

const signedIn = () => fakeApi();
const dialog = () => within(screen.getByRole('dialog'));
const location = () => screen.getByTestId('location').textContent ?? '';

describe('Managing a novel', () => {
  it('lets the importer edit the details, which show at once', async () => {
    const api = signedIn();
    const id = addNovel(api, { title: 'Old Title', library: {} });
    const { user } = renderApp(`/novels/${id}`);

    await chooseMore(user, 'Edit details');
    expect(dialog().getByRole('textbox', { name: 'Title' })).toHaveValue('Old Title');
    expect(dialog().getByRole('textbox', { name: 'Tags' })).toHaveValue('Fantasy, Adventure');
    expect(dialog().getByText(/Chapters and their text stay as the source has them/)).toBeVisible();

    await user.clear(dialog().getByRole('textbox', { name: 'Title' }));
    await user.click(dialog().getByRole('button', { name: 'Save' }));
    expect(dialog().getByRole('textbox', { name: 'Title' })).toHaveAccessibleDescription(
      'Enter a title.',
    );

    await user.type(dialog().getByRole('textbox', { name: 'Title' }), 'New Title');
    await user.clear(dialog().getByRole('textbox', { name: 'Tags' }));
    await user.type(dialog().getByRole('textbox', { name: 'Tags' }), 'Mystery, , Drama ');
    await user.click(dialog().getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'New Title' })).toBeVisible();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.novels.get(id)?.novel.tags).toEqual(['Mystery', 'Drama']);
    expect(api.manageCalls).toEqual([`PATCH ${id}`]);
  });

  it('changes the cover after checking the image', async () => {
    const api = signedIn();
    const id = addNovel(api, { library: {} });
    const { user } = renderApp(`/novels/${id}`);
    await screen.findByRole('button', { name: 'More actions' });
    const input = screen.getByTestId('cover-input');

    await user.upload(input, new File([new Uint8Array(64)], 'front.png', { type: 'image/png' }));
    await waitFor(() => expect(api.manageCalls).toEqual([`POST ${id}`]));
    expect(await screen.findByText('Cover changed')).toBeVisible();

    // The picker's filter aside, a GIF is refused before it is sent.
    fireEvent.change(input, {
      target: { files: [new File(['GIF89a'], 'moving.gif', { type: 'image/gif' })] },
    });
    expect(await screen.findByText(COVER_CHECKS.type)).toBeVisible();
    expect(api.manageCalls).toEqual([`POST ${id}`]);
  });

  it('deletes the novel after a confirmation', async () => {
    const api = signedIn();
    const id = addNovel(api, { title: 'Doomed', chapters: 12, library: {} });
    const { user } = renderApp(`/novels/${id}`);

    await chooseMore(user, 'Delete');
    expect(dialog().getByText(/Its 12 chapters and their stored text/)).toBeVisible();
    await user.click(dialog().getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(location()).toBe('/library'));
    expect(await screen.findByText('“Doomed” was deleted')).toBeVisible();
    expect(api.novels.has(id)).toBe(false);
  });
});
