import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addNovel, fakeApi } from '../../test/fakeApi';
import { renderApp } from '../../test/renderApp';
import type * as platform from '../../platform';

const app = vi.hoisted(() => ({
  kind: 'windows',
  notify: vi.fn(),
  android: {
    allowNotifications: vi.fn(() => Promise.resolve(true)),
    notificationPermission: vi.fn(() =>
      Promise.resolve<'granted' | 'denied' | 'prompt'>('granted'),
    ),
    batteryRestricted: vi.fn(() => Promise.resolve(false)),
    askBatteryExemption: vi.fn(() => Promise.resolve()),
    onBackButton: vi.fn(() => () => undefined),
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
      notify: app.notify,
      ...(app.kind === 'android' ? { android: app.android } : {}),
    }),
}));

const SAVED = { timeout: 3000 };
const section = (name: string) => within(screen.getByRole('region', { name }));

async function openNotifications() {
  const view = renderApp('/settings/notifications');
  await screen.findByRole('region', { name: 'Tell me about' });
  return view;
}

describe('Notification settings', () => {
  beforeEach(() => {
    app.kind = 'windows';
    vi.clearAllMocks();
  });

  it('turns each kind on or off; the new-chapter choices go with their kind', async () => {
    const api = fakeApi();
    const { user } = await openNotifications();
    const kinds = section('Tell me about');
    expect(kinds.getByRole('switch', { name: 'New chapters' })).toBeChecked();
    expect(kinds.getByRole('switch', { name: 'Finished downloads' })).toBeChecked();
    expect(kinds.getByRole('switch', { name: 'Problems' })).toBeChecked();

    await user.click(kinds.getByRole('switch', { name: 'Problems' }));
    await waitFor(() => expect(api.preferenceSaves).toEqual([{ notifyProblems: false }]), SAVED);
    await user.click(kinds.getByRole('switch', { name: 'New chapters' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'New chapters' })).toBeNull());
    await waitFor(
      () => expect(api.preferenceSaves.at(-1)).toEqual({ notifyNewChapters: false }),
      SAVED,
    );
  });

  it('tells about picked novels only, one notification each, and lists the novels that chose', async () => {
    const api = fakeApi();
    const id = addNovel(api, { title: 'Mother of Learning', library: { notify: true } });
    const { user } = await openNotifications();
    const chapters = section('New chapters');
    expect(
      chapters.getByRole('radio', { name: "Every novel I'm reading or following" }),
    ).toBeChecked();

    await user.click(chapters.getByRole('radio', { name: 'Only the novels I pick' }));
    await user.click(chapters.getByRole('radio', { name: 'One for each novel' }));
    await waitFor(
      () =>
        expect(Object.assign({}, ...api.preferenceSaves)).toEqual({
          notifyNovels: 'picked',
          notifyEachNovel: true,
        }),
      SAVED,
    );

    // The novel picked on its page, with a way back to the setting.
    expect(await chapters.findByRole('link', { name: 'Mother of Learning' })).toHaveAttribute(
      'href',
      `/novels/${id}`,
    );
    expect(chapters.getByText('Always')).toBeVisible();
    await user.click(
      chapters.getByRole('button', { name: 'Mother of Learning: follow the setting above' }),
    );
    expect(await chapters.findByText(/No novels picked yet/)).toBeVisible();
    expect(api.library.get(id)?.notify).toBeNull();
  });

  it('keeps titles off the lock screen, and sends a test notification', async () => {
    const api = fakeApi();
    const { user } = await openNotifications();
    await user.click(section('Privacy').getByRole('switch', { name: 'Show novel titles' }));
    await waitFor(() => expect(api.preferenceSaves).toEqual([{ notifyShowTitles: false }]), SAVED);

    await user.click(screen.getByRole('button', { name: 'Send a test notification' }));
    await waitFor(() => expect(app.notify).toHaveBeenCalledOnce());
    expect(app.notify.mock.calls[0]![0]).toMatchObject({ kind: 'test' });
    expect(await section('Try it').findByRole('status')).toHaveTextContent(/^Sent/);
  });

  it('asks Android for permission when it was never asked', async () => {
    app.kind = 'android';
    fakeApi();
    app.android.notificationPermission.mockResolvedValueOnce('prompt');
    const { user } = await openNotifications();
    await user.click(await screen.findByRole('button', { name: 'Allow notifications' }));
    expect(app.android.allowNotifications).toHaveBeenCalledOnce();
  });

  it('says where to turn notifications back on when Android has them off', async () => {
    app.kind = 'android';
    fakeApi();
    app.android.notificationPermission.mockResolvedValueOnce('denied');
    await openNotifications();
    expect(await screen.findByText(/Notifications are off for Webnovel Hub/)).toBeVisible();
  });
});

describe("A novel's Notify button", () => {
  beforeEach(() => {
    app.kind = 'windows';
  });

  it('mutes a novel being read, and turns it back to the setting', async () => {
    const api = fakeApi();
    const id = addNovel(api, { title: 'Mother of Learning', library: { status: 'reading' } });
    const { user } = renderApp(`/novels/${id}`);
    const bell = await screen.findByRole('button', { name: 'Notify me about new chapters' });
    expect(bell).toHaveAttribute('aria-pressed', 'true');

    await user.click(bell);
    expect(bell).toHaveAttribute('aria-pressed', 'false');
    expect(await screen.findByText('No more notifications for Mother of Learning')).toBeVisible();
    expect(api.library.get(id)?.notify).toBe(false);

    // On again is what the setting says anyway: no choice of its own is kept.
    await user.click(bell);
    await waitFor(() => expect(api.library.get(id)?.notify).toBeNull());
  });

  it('picks a novel that is not followed, saying it is checked too', async () => {
    const api = fakeApi();
    const id = addNovel(api, { title: 'Lord of Mysteries', library: { status: 'on_hold' } });
    const { user } = renderApp(`/novels/${id}`);
    const bell = await screen.findByRole('button', { name: 'Notify me about new chapters' });
    expect(bell).toHaveAttribute('aria-pressed', 'false');

    await user.click(bell);
    expect(await screen.findByText(/checked for new chapters too/)).toBeVisible();
    expect(api.library.get(id)?.notify).toBe(true);
  });

  it('is not offered for an EPUB, which has no site to check', async () => {
    const api = fakeApi();
    const id = addNovel(api, { title: 'From a file', epub: true, library: {} });
    renderApp(`/novels/${id}`);
    await screen.findByRole('heading', { level: 1, name: 'From a file' });
    expect(screen.queryByRole('button', { name: 'Notify me about new chapters' })).toBeNull();
  });
});
