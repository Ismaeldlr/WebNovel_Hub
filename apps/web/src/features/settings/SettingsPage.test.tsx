import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { addNovel, fakeApi } from '../../test/fakeApi';
import { renderApp } from '../../test/renderApp';
import { media } from '../../test/setup';

const signedIn = () => fakeApi();
const pageTheme = () => document.documentElement.dataset.theme;
const SAVE_TIMEOUT = { timeout: 3000 };
const section = (name: string) => screen.getByRole('region', { name });

async function openSettings(path = '/settings') {
  const view = renderApp(path);
  expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await screen.findByRole('navigation', { name: 'Settings' });
  return view;
}

describe('Settings page', () => {
  it('shows the look with a preview, and saves changes in the background', async () => {
    const api = signedIn();
    const { user } = await openSettings();
    expect(document.title).toBe('Settings · Webnovel Hub');
    // The groups beside the open one: Appearance first.
    const groups = within(screen.getByRole('navigation', { name: 'Settings' }));
    expect(groups.getByRole('link', { name: /^Appearance/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(groups.getByRole('link', { name: /^Downloads & updates/ })).toHaveAttribute(
      'href',
      '/settings/downloads',
    );
    // One theme for every page: no second theme setting.
    expect(screen.getAllByRole('group', { name: 'Theme' })).toHaveLength(1);

    const appearance = section('Appearance');
    const preview = within(appearance).getByRole('figure', { name: 'Preview' });
    const page = preview.querySelector<HTMLElement>('[style]');
    expect(within(appearance).getByRole('radio', { name: 'Match device' })).toBeChecked();

    await user.click(within(appearance).getByRole('radio', { name: 'Sepia' }));
    // Both text sizes: larger screens and phones.
    fireEvent.change(
      within(appearance).getByRole('slider', { name: 'Text size on larger screens' }),
      { target: { value: '21' } },
    );
    fireEvent.change(within(appearance).getByRole('slider', { name: 'Text size on phones' }), {
      target: { value: '15' },
    });
    await user.click(within(appearance).getByRole('radio', { name: 'Narrow' }));
    await user.click(within(appearance).getByRole('radio', { name: 'Sans serif' }));

    // The whole page takes the theme, the preview included.
    await waitFor(() => expect(pageTheme()).toBe('sepia'));
    expect(page?.style.getPropertyValue('--reader-font-size')).toBe('1.3125rem');
    expect(page?.style.getPropertyValue('--reader-font-size-compact')).toBe('0.9375rem');
    expect(screen.getByText('Saving…')).toBeVisible();

    await waitFor(() => expect(api.preferenceSaves).toHaveLength(1), SAVE_TIMEOUT);
    expect(api.preferenceSaves[0]).toEqual({
      theme: 'sepia',
      fontSize: 21,
      fontSizeCompact: 15,
      contentWidth: 'narrow',
      fontFamily: 'sans',
    });
    expect(await screen.findByText('Saved.')).toBeVisible();
  });

  it('sets how many chapters are downloaded ahead (0 to 10)', async () => {
    const api = signedIn();
    const { user } = await openSettings('/settings/downloads');
    expect(section('New chapters')).toBeVisible();
    const select = within(section('Downloads ahead')).getByRole('combobox', {
      name: 'Chapters to download ahead',
    });
    expect(select).toHaveValue('3');
    const options = within(select).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'None: download each chapter when I open it',
      '1 chapter',
      ...Array.from({ length: 9 }, (_, index) => `${index + 2} chapters`),
    ]);

    await user.selectOptions(select, '0');
    expect(select).toHaveValue('0');
    await waitFor(() => expect(api.preferenceSaves).toEqual([{ prefetchCount: 0 }]), SAVE_TIMEOUT);
    expect(api.preferences.prefetchCount).toBe(0);
  });

  it("changes the theme from the top bar's menu too, and saves it", async () => {
    const api = signedIn();
    const { user } = await openSettings();
    await user.click(screen.getByRole('button', { name: 'Theme: Match device' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Black' }));
    await waitFor(() => expect(pageTheme()).toBe('black'));
    // The picker in Settings shows the same theme: it is one setting.
    expect(within(section('Appearance')).getByRole('radio', { name: 'Black' })).toBeChecked();
    await waitFor(() => expect(api.preferenceSaves).toEqual([{ theme: 'black' }]), SAVE_TIMEOUT);
  });

  it('lists the groups with their values on a phone, each opening its own page', async () => {
    media.matches = true; // a phone
    signedIn();
    const { user } = renderApp('/settings');
    const groups = within(await screen.findByRole('navigation', { name: 'Settings' }));
    expect(groups.getByRole('link', { name: /^Appearance/ })).toHaveTextContent(
      'Match device · Serif · 16 px',
    );
    expect(groups.getByRole('link', { name: /^Downloads & updates/ })).toHaveTextContent(
      '3 chapters ahead',
    );
    expect(screen.queryByRole('region', { name: 'Appearance' })).toBeNull();

    await user.click(groups.getByRole('link', { name: /^Downloads & updates/ }));
    expect(await screen.findByRole('region', { name: 'Downloads ahead' })).toBeVisible();
    expect(screen.queryByRole('navigation', { name: 'Settings' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('navigation', { name: 'Settings' })).toBeVisible();
  });

  it('says so when the settings do not load', async () => {
    const api = signedIn();
    api.preferencesGate = Promise.reject(new TypeError('Failed to fetch'));
    api.preferencesGate.catch(() => undefined);
    renderApp('/settings');
    expect(await screen.findByRole('heading', { name: "Your settings didn't load" })).toBeVisible();
  });

  it("lists each novel's downloaded chapters, and deletes one novel's", async () => {
    const api = signedIn();
    const big = addNovel(api, { title: 'Long One', chapters: 4, fetched: [1, 2, 3, 4] });
    addNovel(api, { title: 'Short One', chapters: 2, fetched: [1] });
    const { user } = await openSettings('/settings/storage');
    const storage = section('Downloaded chapters');
    const rows = await within(storage).findAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringMatching(/^Long One4 chapters · \d+ B/),
      expect.stringMatching(/^Short One1 chapter · \d+ B/),
    ]);
    await user.click(
      within(storage).getByRole('button', { name: 'Delete the downloaded chapters of Long One' }),
    );
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete downloads' }),
    );
    await waitFor(() => expect(within(storage).getAllByRole('listitem')).toHaveLength(1));
    expect(api.novels.get(big)?.chapters.some((chapter) => chapter.isFetched)).toBe(false);
  });
});
