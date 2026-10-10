import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi } from '../../test/fakeApi';
import { renderApp } from '../../test/renderApp';
import type * as platform from '../../platform';

const app = vi.hoisted(() => ({
  kind: 'windows',
  updates: {
    version: vi.fn(() => Promise.resolve('0.1.0')),
    checkForUpdate: vi.fn(() => Promise.resolve<string | null>(null)),
    installUpdate: vi.fn(() => Promise.resolve()),
  },
  android: {
    allowNotifications: vi.fn(() => Promise.resolve(true)),
    batteryRestricted: vi.fn(() => Promise.resolve(false)),
    askBatteryExemption: vi.fn(() => Promise.resolve()),
  },
}));

// The page as it runs inside the Windows or the Android app.
vi.mock('../../platform', async (original) => ({
  ...(await original<typeof platform>()),
  get appKind() {
    return app.kind;
  },
  getPlatform: () =>
    Promise.resolve({
      updates: app.updates,
      ...(app.kind === 'android' ? { android: app.android } : {}),
    }),
}));

const section = (name: string) => screen.getByRole('region', { name });

async function openSettings() {
  const view = renderApp('/settings');
  await screen.findByRole('region', { name: 'Background fetching' });
  return view;
}

describe('Settings in the Windows app', () => {
  beforeEach(() => {
    app.kind = 'windows';
  });

  it('chooses what closing the window does, and saves it', async () => {
    const api = fakeApi();
    const { user } = await openSettings();
    const background = section('Background fetching');
    expect(within(background).getByRole('radio', { name: 'Quit the app' })).toBeChecked();
    expect(within(background).queryByRole('group', { name: 'Download whole novels' })).toBeNull();

    await user.click(
      within(background).getByRole('radio', { name: 'Keep fetching in the background' }),
    );
    await waitFor(() => expect(api.preferenceSaves).toEqual([{ backgroundFetching: true }]), {
      timeout: 3000,
    });
  });

  it('turns new-chapter notifications off', async () => {
    const api = fakeApi();
    const { user } = await openSettings();
    const updates = section('New chapters');
    expect(
      within(updates).getByRole('radio', { name: 'Tell me with a notification' }),
    ).toBeChecked();

    await user.click(within(updates).getByRole('radio', { name: "Don't notify me" }));
    await waitFor(() => expect(api.preferenceSaves).toEqual([{ notifyNewChapters: false }]), {
      timeout: 3000,
    });
  });

  it('shows the version and installs a newer one', async () => {
    fakeApi();
    app.updates.checkForUpdate.mockResolvedValueOnce(null).mockResolvedValueOnce('0.2.0');
    const { user } = await openSettings();
    const about = section('App');
    expect(await within(about).findByText('Webnovel Hub 0.1.0')).toBeVisible();

    await user.click(within(about).getByRole('button', { name: 'Check for updates' }));
    expect(await within(about).findByText('This is the latest version.')).toBeVisible();

    await user.click(within(about).getByRole('button', { name: 'Check for updates' }));
    await user.click(
      await within(about).findByRole('button', { name: 'Install version 0.2.0 and restart' }),
    );
    expect(app.updates.installUpdate).toHaveBeenCalledOnce();
  });
});

describe('Settings in the Android app', () => {
  beforeEach(() => {
    app.kind = 'android';
    vi.clearAllMocks();
  });

  it('keeps downloading in the background, asking to show notifications', async () => {
    const api = fakeApi();
    const { user } = await openSettings();
    const background = section('Background fetching');
    expect(within(background).getByRole('radio', { name: 'Pause downloads' })).toBeChecked();

    await user.click(
      within(background).getByRole('radio', { name: 'Keep downloading in the background' }),
    );
    await waitFor(() => expect(api.preferenceSaves).toEqual([{ backgroundFetching: true }]), {
      timeout: 3000,
    });
    expect(app.android.allowNotifications).toHaveBeenCalledOnce();
  });

  it('says when notifications are off, and offers to lift battery limits', async () => {
    const api = fakeApi();
    app.android.allowNotifications.mockResolvedValueOnce(false);
    app.android.batteryRestricted.mockResolvedValue(true);
    const { user } = await openSettings();
    const background = section('Background fetching');

    await user.click(
      within(background).getByRole('radio', { name: 'Keep downloading in the background' }),
    );
    expect(await within(background).findByText(/Notifications are off/)).toBeVisible();
    await waitFor(() => expect(api.preferenceSaves).toHaveLength(1), { timeout: 3000 });
    await user.click(
      await within(background).findByRole('button', { name: 'Allow background use' }),
    );
    expect(app.android.askBatteryExemption).toHaveBeenCalledOnce();
  });

  it('downloads whole novels only on Wi-Fi when asked', async () => {
    const api = fakeApi();
    const { user } = await openSettings();
    const background = section('Background fetching');
    expect(
      within(background).getByRole('radio', { name: 'On Wi-Fi or mobile data' }),
    ).toBeChecked();

    await user.click(within(background).getByRole('radio', { name: 'Only on Wi-Fi' }));
    await waitFor(() => expect(api.preferenceSaves).toEqual([{ wifiOnly: true }]), {
      timeout: 3000,
    });
  });

  it('opens the download of a newer version', async () => {
    fakeApi();
    app.updates.checkForUpdate.mockResolvedValueOnce('0.2.0');
    const { user } = await openSettings();
    const about = section('App');

    await user.click(within(about).getByRole('button', { name: 'Check for updates' }));
    await user.click(await within(about).findByRole('button', { name: 'Download version 0.2.0' }));
    expect(app.updates.installUpdate).toHaveBeenCalledOnce();
  });
});
