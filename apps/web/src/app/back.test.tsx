import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { addNovel, addRead, fakeApi } from '../test/fakeApi';
import { renderApp } from '../test/renderApp';
import { media } from '../test/setup';
import { parentOf } from './back';

const location = () => screen.getByTestId('location').textContent;

describe('parentOf', () => {
  it('puts a chapter under its novel, a novel under the lists, and the rest under the library', () => {
    expect(parentOf('/reader/abc/12')?.fallback).toBe('/novels/abc');
    expect(parentOf('/reader/abc/12')?.matches('/novels/abc')).toBe(true);
    expect(parentOf('/reader/abc/12')?.matches('/novels/xyz')).toBe(false);

    const novel = parentOf('/novels/abc')!;
    expect(novel.fallback).toBe('/library');
    expect(['/library', '/history', '/updates'].every(novel.matches)).toBe(true);
    expect(novel.matches('/reader/abc/1')).toBe(false);

    expect(parentOf('/settings/appearance')?.fallback).toBe('/settings');
    expect(parentOf('/profile/terms')?.matches('/reader/abc/3')).toBe(true);
    expect(parentOf('/history')?.fallback).toBe('/library');
    expect(parentOf('/library')).toBeNull();
  });
});

describe('back', () => {
  it('goes from a chapter up to its novel, then to the library, however many chapters were read', async () => {
    media.matches = true; // a phone: the top bar has a back button
    const api = fakeApi();
    const id = addNovel(api, {
      title: 'Mother of Learning',
      chapters: 3,
      fetched: [1, 2, 3],
      library: {},
    });
    const { user } = renderApp('/library');

    const [card] = await screen.findAllByRole('link', { name: /Mother of Learning/ });
    await user.click(card!);
    await user.click(await screen.findByRole('link', { name: 'Start reading at chapter 1' }));
    expect(await screen.findByText('The opening of chapter 1.')).toBeVisible();
    // Two chapters on: they take each other's place.
    const [nav] = screen.getAllByRole('navigation', { name: /Chapter navigation/ });
    await user.click(within(nav!).getByRole('link', { name: /Next chapter/ }));
    expect(await screen.findByText('The opening of chapter 2.')).toBeVisible();
    const [nextNav] = screen.getAllByRole('navigation', { name: /Chapter navigation/ });
    await user.click(within(nextNav!).getByRole('link', { name: /Next chapter/ }));
    expect(await screen.findByText('The opening of chapter 3.')).toBeVisible();

    // The reader's arrow goes back to the novel, not on to a new copy of it...
    await user.click(screen.getByRole('link', { name: 'Back to Mother of Learning' }));
    expect(location()).toBe(`/novels/${id}`);
    // ...so the novel's back button goes to the library, not to the chapter just left.
    await user.click(await screen.findByRole('button', { name: 'Back' }));
    expect(location()).toBe('/library');
  });

  it('goes up to the novel from a chapter opened elsewhere, and from there to that list', async () => {
    media.matches = true;
    const api = fakeApi();
    const id = addNovel(api, { title: 'Mother of Learning', chapters: 3, fetched: [1, 2, 3] });
    addRead(api, id, 2, { daysAgo: 0 });
    const { user } = renderApp('/history');

    // Straight to a chapter from the history: going up puts the novel in its place.
    await user.click(await screen.findByRole('link', { name: 'Chapter 2: Part 2' }));
    expect(await screen.findByText('The opening of chapter 2.')).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Back to Mother of Learning' }));
    expect(location()).toBe(`/novels/${id}`);
    await user.click(await screen.findByRole('button', { name: 'Back' }));
    expect(location()).toBe('/history');
  });
});
