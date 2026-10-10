import { READER_PREFERENCE_DEFAULTS } from '@webnovel-hub/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { addNovel, fakeApi } from '../../test/fakeApi';
import { renderApp } from '../../test/renderApp';
import { media } from '../../test/setup';
import { PREFERENCES_STORAGE_KEY } from '../preferences/store';

const signedIn = () => fakeApi();
const location = () => screen.getByTestId('location').textContent;
const pageTheme = () => document.documentElement.dataset.theme;
/** A --reader-* variable on the reading column. */
const chapterStyle = (name: string) =>
  document.querySelector('article')?.style.getPropertyValue(name) ?? '';
/** Applied on the next tick (the query notifies its views then), long before any save. */
const expectStyle = (name: string, value: string) =>
  waitFor(() => expect(chapterStyle(name)).toBe(value), { timeout: 200 });
const SAVE_TIMEOUT = { timeout: 3000 };

async function openOptions(user: ReturnType<typeof renderApp>['user']) {
  await user.click(await screen.findByRole('button', { name: 'Reading options' }));
  return screen.getByRole('dialog', { name: 'Reading options' });
}

describe('reading options in the reader', () => {
  it('restyles the chapter at once, and saves every change once after a pause', async () => {
    const api = signedIn();
    const id = addNovel(api, { chapters: 3, fetched: [1, 2, 3] });
    const { user } = renderApp(`/reader/${id}/1`);
    expect(await screen.findByText('The opening of chapter 1.')).toBeVisible();
    await expectStyle('--reader-font-size', '1.125rem');
    await expectStyle('--reader-font-size-compact', '1rem');
    expect(pageTheme()).toBe('light');

    const panel = await openOptions(user);
    // On a larger screen it offers that screen's text size only.
    expect(within(panel).queryByRole('slider', { name: 'Text size on phones' })).toBeNull();
    expect(panel).toHaveFocus();

    // Text size across the allowed range.
    const size = within(panel).getByRole('slider', { name: 'Text size on larger screens' });
    expect(size).toHaveAttribute('aria-valuetext', '18 pixels');
    expect(size).toHaveAttribute('min', '14');
    expect(size).toHaveAttribute('max', '28');
    fireEvent.change(size, { target: { value: '28' } });
    await expectStyle('--reader-font-size', '1.75rem');
    fireEvent.change(size, { target: { value: '14' } });
    await expectStyle('--reader-font-size', '0.875rem');
    fireEvent.change(size, { target: { value: '24' } });
    expect(size).toHaveAttribute('aria-valuetext', '24 pixels');

    // Line spacing, width, font, theme.
    fireEvent.change(within(panel).getByRole('slider', { name: 'Line spacing' }), {
      target: { value: '2' },
    });
    await expectStyle('--reader-line-height', '2');
    await user.click(within(panel).getByRole('radio', { name: 'Wide' }));
    await expectStyle('--reader-measure', '50rem');
    await user.click(within(panel).getByRole('radio', { name: 'Hyperlegible' }));
    await expectStyle('--reader-font', 'var(--font-ui)');
    await user.click(within(panel).getByRole('radio', { name: 'Dark' }));
    await waitFor(() => expect(pageTheme()).toBe('dark'));
    expect(within(panel).getByRole('radio', { name: 'Dark' })).toBeChecked();

    // Nothing is sent while the reader is still adjusting.
    expect(within(panel).getByRole('status')).toHaveTextContent('Saving…');
    expect(api.preferenceSaves).toEqual([]);
    await waitFor(() => expect(api.preferenceSaves).toHaveLength(1), SAVE_TIMEOUT);
    expect(api.preferenceSaves[0]).toEqual({
      fontSize: 24,
      lineSpacing: 2,
      contentWidth: 'wide',
      fontFamily: 'hyperlegible',
      theme: 'dark',
    });
    expect(await within(panel).findByText('Saved.')).toBeVisible();
    expect(api.preferences).toMatchObject({ fontSize: 24, theme: 'dark' });
  });

  it('keeps the settings from chapter to chapter, and after a reload', async () => {
    const api = signedIn();
    api.preferences = { ...READER_PREFERENCE_DEFAULTS, fontSize: 22, theme: 'sepia' };
    const id = addNovel(api, { chapters: 3, fetched: [1, 2] });
    const first = renderApp(`/reader/${id}/1`);
    expect(await screen.findByText('The opening of chapter 1.')).toBeVisible();
    await expectStyle('--reader-font-size', '1.375rem');
    expect(pageTheme()).toBe('sepia');

    await first.user.keyboard('{ArrowRight}');
    expect(await screen.findByText('The opening of chapter 2.')).toBeVisible();
    await expectStyle('--reader-font-size', '1.375rem');
    expect(pageTheme()).toBe('sepia');
    expect(JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? '{}')).toMatchObject({
      userId: 'reader',
      preferences: { fontSize: 22, theme: 'sepia' },
    });
    first.unmount();

    // A reload while the server is slow to answer: this device's copy applies at once.
    let answer = () => undefined as void;
    api.preferencesGate = new Promise((resolve) => (answer = resolve));
    renderApp(`/reader/${id}/2`);
    expect(await screen.findByRole('button', { name: 'Reading options' })).toBeEnabled();
    expect(pageTheme()).toBe('sepia');
    expect(await screen.findByText('The opening of chapter 2.')).toBeVisible();
    await expectStyle('--reader-font-size', '1.375rem');
    answer();
  });

  it("uses the chapter's copy of the settings until they load, never the default look", async () => {
    const api = signedIn();
    api.preferences = { ...READER_PREFERENCE_DEFAULTS, fontSize: 26, theme: 'dark' };
    api.preferencesGate = new Promise(() => undefined); // never answers
    const id = addNovel(api, { chapters: 1, fetched: [1] });
    renderApp(`/reader/${id}/1`);
    expect(await screen.findByText('The opening of chapter 1.')).toBeVisible();
    await expectStyle('--reader-font-size', '1.625rem');
    // Changing them has to wait for the saved ones.
    expect(screen.getByRole('button', { name: 'Reading options' })).toBeDisabled();
  });

  it('shows the one theme in the reader and on every other page', async () => {
    const api = signedIn();
    api.preferences = { ...READER_PREFERENCE_DEFAULTS, theme: 'dark' };
    const id = addNovel(api, { title: 'Worm', chapters: 2, fetched: [1] });
    const { user } = renderApp(`/reader/${id}/1`);
    expect(await screen.findByText('The opening of chapter 1.')).toBeVisible();
    await waitFor(() => expect(pageTheme()).toBe('dark'));

    // Changed while reading, it stays changed outside the reader.
    const panel = await openOptions(user);
    await user.click(within(panel).getByRole('radio', { name: 'Black' }));
    await waitFor(() => expect(pageTheme()).toBe('black'));
    await user.click(screen.getByRole('link', { name: 'Back to Worm' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Worm' })).toBeVisible();
    expect(pageTheme()).toBe('black');
    expect(screen.getByRole('button', { name: 'Theme: Black' })).toBeVisible();
  });

  it('offers the phone text size on a phone, and a toolbar at the bottom', async () => {
    media.matches = true; // every query matches: a phone, in dark mode
    const api = signedIn();
    const id = addNovel(api, { chapters: 1, fetched: [1] });
    const { user } = renderApp(`/reader/${id}/1`);
    expect(await screen.findByText('The opening of chapter 1.')).toBeVisible();
    // Previous, chapters and next move to the toolbar; the one above the text goes.
    expect(screen.getByRole('navigation', { name: 'Chapter navigation, toolbar' })).toBeVisible();
    expect(screen.queryByRole('navigation', { name: 'Chapter navigation' })).toBeNull();

    const panel = await openOptions(user);
    expect(within(panel).queryByRole('slider', { name: 'Text size on larger screens' })).toBeNull();
    // The column is the screen: no width to choose.
    expect(within(panel).queryByRole('group', { name: 'Width' })).toBeNull();
    const size = within(panel).getByRole('slider', { name: 'Text size on phones' });
    expect(size).toHaveAttribute('aria-valuetext', '16 pixels');
    fireEvent.change(size, { target: { value: '15' } });
    await expectStyle('--reader-font-size-compact', '0.9375rem');
    await expectStyle('--reader-font-size', '1.125rem');
    await waitFor(
      () => expect(api.preferenceSaves).toEqual([{ fontSizeCompact: 15 }]),
      SAVE_TIMEOUT,
    );
  });

  it('keeps arrow keys in the panel, and closes with Escape back to its button', async () => {
    const api = signedIn();
    const id = addNovel(api, { chapters: 3, fetched: [1, 2, 3] });
    const { user } = renderApp(`/reader/${id}/2`);
    expect(await screen.findByText('The opening of chapter 2.')).toBeVisible();

    const panel = await openOptions(user);
    within(panel).getByRole('button', { name: 'Close reading options' }).focus();
    await user.keyboard('{ArrowRight}');
    within(panel).getByRole('radio', { name: 'Light' }).focus();
    await user.keyboard('{ArrowLeft}');
    expect(location()).toBe(`/reader/${id}/2`);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Reading options' })).toBeNull();
    const button = screen.getByRole('button', { name: 'Reading options' });
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute('aria-expanded', 'false');

    // With the panel closed, the arrows turn pages again.
    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(location()).toBe(`/reader/${id}/3`));
  });

  it('puts back the saved settings when a save fails, and says so', async () => {
    const api = signedIn();
    api.preferenceSaveError = 'The font size must be a whole number of pixels from 14 to 28.';
    const id = addNovel(api, { chapters: 1, fetched: [1] });
    const { user } = renderApp(`/reader/${id}/1`);
    expect(await screen.findByText('The opening of chapter 1.')).toBeVisible();

    const panel = await openOptions(user);
    fireEvent.change(within(panel).getByRole('slider', { name: 'Text size on larger screens' }), {
      target: { value: '26' },
    });
    await expectStyle('--reader-font-size', '1.625rem');

    expect(
      await screen.findByText("Couldn't save your reading settings", {}, SAVE_TIMEOUT),
    ).toBeVisible();
    await expectStyle('--reader-font-size', '1.125rem');
    expect(within(panel).getByRole('status')).toHaveTextContent('Not saved.');
    expect(api.preferences.fontSize).toBe(18);
  });

  it('resets the reading look to the defaults, leaving downloads alone', async () => {
    const api = signedIn();
    api.preferences = {
      ...READER_PREFERENCE_DEFAULTS,
      fontSize: 26,
      theme: 'dark',
      fontFamily: 'system',
      prefetchCount: 7,
    };
    const id = addNovel(api, { chapters: 1, fetched: [1] });
    const { user } = renderApp(`/reader/${id}/1`);
    expect(await screen.findByText('The opening of chapter 1.')).toBeVisible();

    const panel = await openOptions(user);
    await user.click(within(panel).getByRole('button', { name: 'Reset to defaults' }));
    await expectStyle('--reader-font-size', '1.125rem');
    // The default theme follows the device: light here.
    await waitFor(() => expect(pageTheme()).toBe('light'));
    expect(within(panel).getByRole('button', { name: 'Reset to defaults' })).toBeDisabled();

    await waitFor(() => expect(api.preferenceSaves).toHaveLength(1), SAVE_TIMEOUT);
    expect(api.preferenceSaves[0]).toEqual({
      theme: 'system',
      fontSize: 18,
      fontSizeCompact: 16,
      lineSpacing: 1.6,
      contentWidth: 'medium',
      fontFamily: 'serif',
    });
    expect(api.preferences.prefetchCount).toBe(7);
  });
});
