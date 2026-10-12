import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { addNovel, addRead, fakeApi } from '../../test/fakeApi';
import { renderApp } from '../../test/renderApp';

const location = () => screen.getByTestId('location').textContent ?? '';

describe('Continue Reading', () => {
  it('opens the chapter read last, whichever novel it is in', async () => {
    const api = fakeApi();
    const ashen = addNovel(api, { title: 'Ashen Sky', chapters: 20 });
    const brass = addNovel(api, { title: 'Brass Harbor', chapters: 5 });
    addRead(api, ashen, 7, { daysAgo: 2 });
    addRead(api, brass, 3, { daysAgo: 0 });
    renderApp('/reader');

    await waitFor(() => expect(location()).toBe(`/reader/${brass}/3`));
  });

  it('points to the library when nothing was read yet', async () => {
    fakeApi();
    renderApp('/reader');

    expect(await screen.findByRole('heading', { name: 'Nothing to continue yet' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Go to My Library' })).toBeVisible();
  });
});
