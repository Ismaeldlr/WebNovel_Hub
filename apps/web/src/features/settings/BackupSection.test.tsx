import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi } from '../../test/fakeApi';
import { renderApp } from '../../test/renderApp';
import type * as platform from '../../platform';

const app = vi.hoisted(() => ({
  backups: {
    tempPath: vi.fn((name: string) => Promise.resolve(`C:/temp/${name}`)),
    save: vi.fn(() => Promise.resolve(true)),
    pick: vi.fn(() => Promise.resolve<string | null>('C:/temp/restore.whub')),
    kept: vi.fn(() =>
      Promise.resolve([
        {
          name: 'webnovel-hub-before-restore-2026-10-01-093000.whub',
          path: 'C:/data/backups/webnovel-hub-before-restore-2026-10-01-093000.whub',
        },
      ]),
    ),
    replaceLibrary: vi.fn(() => Promise.resolve()),
  },
  core: {
    backups: {
      write: vi.fn(() => Promise.resolve()),
      inspect: vi.fn(() =>
        Promise.resolve({ version: 5, novels: 3, chapters: 120, lastChange: null }),
      ),
      summary: vi.fn(() =>
        Promise.resolve({ version: 5, novels: 1, chapters: 1, lastChange: null }),
      ),
    },
    release: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('../../platform', async (original) => ({
  ...(await original<typeof platform>()),
  appKind: 'windows',
  getPlatform: () => Promise.resolve({ backups: app.backups }),
}));

vi.mock('../../app/core', () => ({ getCore: () => Promise.resolve(app.core) }));

const reload = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  fakeApi();
  vi.stubGlobal('location', { ...window.location, reload });
});
afterEach(() => vi.unstubAllGlobals());

async function openBackup() {
  const view = renderApp('/settings/backup');
  return { ...view, section: await screen.findByRole('region', { name: 'Backup' }) };
}

describe('Backups in Settings', () => {
  it('write the library to a file the reader saves', async () => {
    const { user, section } = await openBackup();
    await user.click(within(section).getByRole('button', { name: 'Back up library' }));

    expect(await screen.findByText(/^Saved webnovel-hub-\d{4}-\d{2}-\d{2}\.whub$/)).toBeVisible();
    const [name] = app.backups.tempPath.mock.calls[0]!;
    expect(app.core.backups.write).toHaveBeenCalledWith(`C:/temp/${name}`);
    expect(app.backups.save).toHaveBeenCalledWith(`C:/temp/${name}`, name);
  });

  it('replace the library with a picked backup once the reader confirms', async () => {
    const { user, section } = await openBackup();
    await user.click(within(section).getByRole('button', { name: 'Restore from a file' }));

    const dialog = await screen.findByRole('dialog', { name: 'Replace your library?' });
    expect(dialog).toHaveTextContent('The backup holds 3 novels and 120 saved chapters');
    expect(dialog).toHaveTextContent('which holds 1 novel and 1 saved chapter');
    await user.click(within(dialog).getByRole('button', { name: 'Replace library' }));

    await vi.waitFor(() => expect(reload).toHaveBeenCalled());
    expect(app.core.release).toHaveBeenCalled();
    expect(app.backups.replaceLibrary).toHaveBeenCalledWith(
      'C:/temp/restore.whub',
      expect.stringMatching(/^webnovel-hub-before-restore-\d{4}-\d{2}-\d{2}-\d{6}\.whub$/),
    );
  });

  it('say why a file cannot be restored, and change nothing', async () => {
    app.core.backups.inspect.mockRejectedValueOnce(
      new Error("This file isn't a Webnovel Hub backup."),
    );
    const { user, section } = await openBackup();
    await user.click(within(section).getByRole('button', { name: 'Restore from a file' }));

    expect(await screen.findByText("This file isn't a Webnovel Hub backup.")).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(app.core.release).not.toHaveBeenCalled();
  });

  it('offer to put back a library a restore replaced', async () => {
    const { user, section } = await openBackup();
    await user.click(await within(section).findByRole('button', { name: 'Put back' }));

    expect(await screen.findByRole('dialog', { name: 'Replace your library?' })).toBeVisible();
    expect(app.backups.pick).not.toHaveBeenCalled();
    expect(app.core.backups.inspect).toHaveBeenCalledWith(
      'C:/data/backups/webnovel-hub-before-restore-2026-10-01-093000.whub',
    );
  });
});
