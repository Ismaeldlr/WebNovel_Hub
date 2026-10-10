import { EPUB_MAX_BYTES } from '@webnovel-hub/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeApi } from '../../test/fakeApi';
import { renderApp } from '../../test/renderApp';
import { EPUB_CHECKS, checkEpubFile } from './epubCheck';

const signedIn = () => fakeApi();
const epub = (name = 'The Lantern Courier.epub', bytes = 2048) =>
  new File([new Uint8Array(bytes)], name, { type: 'application/epub+zip' });

function fileInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('no file input');
  return input;
}

/** The reason a file was refused, under the drop zone (the toast stack is an alert too). */
const problem = () => document.querySelector('p[role="alert"]');

/** Drops files on the drop zone, as dragging them from the desktop does. */
function drop(files: File[]) {
  const zone = screen.getByText(/Drag an EPUB file here/).parentElement as HTMLElement;
  const dataTransfer = { files, types: ['Files'], dropEffect: 'none' };
  fireEvent.dragOver(zone, { dataTransfer });
  expect(screen.getByText('Drop it to choose this file')).toBeVisible();
  fireEvent.drop(zone, { dataTransfer });
}

describe('Add Novels from an EPUB file', () => {
  it('imports a chosen file, then summarizes it and opens the novel', async () => {
    const api = signedIn();
    let release = () => {};
    api.uploadGate = new Promise((resolve) => {
      release = resolve;
    });
    const { user } = renderApp('/add?from=epub');

    expect(await screen.findByRole('heading', { name: 'EPUB file' })).toBeVisible();
    await user.upload(fileInput(), epub());
    expect(screen.getByText('The Lantern Courier.epub')).toBeVisible();
    expect(screen.getByText('2 KB')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Choose another file' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByText('Reading the EPUB…')).toBeVisible();
    expect(screen.getByRole('progressbar', { name: 'Import progress' })).toHaveAttribute(
      'aria-valuetext',
      'Reading the EPUB',
    );
    expect(screen.getByRole('button', { name: 'Choose another file' })).toBeDisabled();
    release();

    expect(
      await screen.findByRole('heading', { name: 'Imported “The Lantern Courier”' }),
    ).toBeVisible();
    expect(screen.getByText('3 chapters stored and ready to read.')).toBeVisible();
    expect(screen.getByText('1,234')).toBeVisible();
    expect(api.epubUploads).toEqual(['The Lantern Courier.epub']);

    await user.click(screen.getByRole('link', { name: 'View novel' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'The Lantern Courier' }),
    ).toBeVisible();
  });

  it('checks the file before importing it, whether dropped or chosen', async () => {
    const api = signedIn();
    renderApp('/add?from=epub');
    await screen.findByRole('heading', { name: 'EPUB file' });

    drop([new File(['notes'], 'notes.txt', { type: 'text/plain' })]);
    expect(problem()).toHaveTextContent(EPUB_CHECKS.notEpub);
    expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument();

    drop([epub('a.epub'), epub('b.epub')]);
    expect(problem()).toHaveTextContent(EPUB_CHECKS.oneFile);

    drop([epub('Dropped.epub')]);
    expect(problem()).toBeNull();
    expect(screen.getByText('Dropped.epub')).toBeVisible();
    expect(api.epubUploads).toEqual([]);
  });

  it('refuses empty files and files over 50 MB', () => {
    const big = epub('big.epub', 1);
    Object.defineProperty(big, 'size', { value: EPUB_MAX_BYTES + 1 });
    expect(checkEpubFile(big)).toBe(EPUB_CHECKS.tooLarge);
    expect(checkEpubFile(epub('empty.epub', 0))).toBe(EPUB_CHECKS.empty);
    expect(checkEpubFile(epub('Fine.EPUB'))).toBeNull();
  });

  it("shows the server's reason and lets the reader try again", async () => {
    const api = signedIn();
    api.epubOutcome = { status: 400, error: 'This EPUB has no chapters with text to read.' };
    const { user } = renderApp('/add?from=epub');
    await screen.findByRole('heading', { name: 'EPUB file' });
    await user.upload(fileInput(), epub('Pictures.epub'));
    await user.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() =>
      expect(problem()).toHaveTextContent('This EPUB has no chapters with text to read.'),
    );
    api.epubOutcome = 'created';
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByRole('heading', { name: 'Imported “Pictures”' })).toBeVisible();
    expect(api.epubUploads).toEqual(['Pictures.epub', 'Pictures.epub']);
  });

  it('says when the file is already in the library, or was added from the catalog', async () => {
    const api = signedIn();
    api.epubOutcome = 'conflict';
    const { user } = renderApp('/add?from=epub');
    await screen.findByRole('heading', { name: 'EPUB file' });
    await user.upload(fileInput(), epub('Harbour Songs.epub'));
    await user.click(screen.getByRole('button', { name: 'Import' }));

    const notice = await screen.findByText('“Harbour Songs” is already in your library.');
    const box = notice.closest('[role="status"]') as HTMLElement;
    expect(box).toHaveTextContent('This exact file was imported before');
    expect(within(box).getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/novels\/novel-\d+$/),
    );

    api.epubOutcome = 'duplicate';
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(
      await screen.findByRole('heading', { name: '“Harbour Songs” is in your library' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Import another' }));
    expect(screen.getByRole('button', { name: 'Choose a file' })).toBeVisible();
  });
});
