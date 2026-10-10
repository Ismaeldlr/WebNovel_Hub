import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeApi } from '../../test/fakeApi';
import { renderApp } from '../../test/renderApp';

const signedIn = () => fakeApi();
const pageTheme = () => document.documentElement.dataset.theme;
const SAVE_TIMEOUT = { timeout: 3000 };
const section = (name: string) => screen.getByRole('region', { name });

async function openSettings() {
  const view = renderApp('/settings');
  expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await screen.findByRole('region', { name: 'Appearance' });
  return view;
}

describe('Settings page', () => {
  it('shows the look with a preview, and saves changes in the background', async () => {
    const api = signedIn();
    const { user } = await openSettings();
    expect(document.title).toBe('Settings · Webnovel Hub');
    for (const name of ['Appearance', 'Downloads ahead', 'New chapters']) {
      expect(section(name)).toBeVisible();
    }
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
    const { user } = await openSettings();
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

  it('says so when the settings do not load', async () => {
    const api = signedIn();
    api.preferencesGate = Promise.reject(new TypeError('Failed to fetch'));
    api.preferencesGate.catch(() => undefined);
    renderApp('/settings');
    expect(await screen.findByRole('heading', { name: "Your settings didn't load" })).toBeVisible();
  });
});
