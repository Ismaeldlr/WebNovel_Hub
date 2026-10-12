import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { addNovel, fakeApi } from '../../test/fakeApi';
import { renderApp } from '../../test/renderApp';

const signedIn = () => fakeApi();
/** The value of one of the facts under the title, e.g. "Read". */
const fact = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling;
describe('novel page', () => {
  it('shows the metadata and the library controls', async () => {
    const api = signedIn();
    const id = addNovel(api, { title: 'Mother of Learning', chapters: 12, library: {} });
    renderApp(`/novels/${id}`);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mother of Learning' }),
    ).toBeVisible();
    expect(document.title).toBe('Mother of Learning · Webnovel Hub');
    expect(screen.getByText('by A. Writer')).toBeVisible();
    expect(screen.getByRole('link', { name: /View on Royal Road/ })).toHaveAttribute(
      'href',
      expect.stringContaining('royalroad.com'),
    );
    expect(
      within(screen.getByRole('list', { name: 'Tags' })).getAllByRole('listitem'),
    ).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Start reading at chapter 1' })).toBeVisible();

    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('reading');
    expect(screen.getByRole('button', { name: 'Favorite' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(fact('Read')).toHaveTextContent('0%');
    expect(screen.getByText(/Checked for updates .* · Added /)).toBeVisible();
  });

  it('shows the progress, continues where the reader left off, and changes the status', async () => {
    const api = signedIn();
    const id = addNovel(api, {
      title: 'The Wandering Inn',
      chapters: 40,
      library: {
        lastReadChapterNumber: 7,
        furthestChapterNumber: 10,
        lastReadAt: '2026-09-26T09:00:00Z',
      },
      newChapters: [39, 40],
    });
    const { user } = renderApp(`/novels/${id}`);

    expect(await screen.findByRole('link', { name: 'Continue at chapter 7' })).toHaveAttribute(
      'href',
      `/reader/${id}/7`,
    );
    expect(fact('Chapters')).toHaveTextContent('40');
    expect(fact('Read')).toHaveTextContent('25%');
    expect(screen.getByRole('link', { name: '2 new chapters' })).toHaveAttribute(
      'href',
      expect.stringContaining('?order=desc'),
    );
    expect(screen.getByText(/^Last read/)).toBeVisible();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'completed');
    await waitFor(() => expect(api.library.get(id)?.status).toBe('completed'));
  });

  it('says so when the novel is not in the library', async () => {
    signedIn();
    renderApp('/novels/no-such-novel');
    expect(
      await screen.findByRole('heading', { name: "This novel isn't in your library" }),
    ).toBeVisible();
  });
});

describe('chapter list', () => {
  it('pages through a long novel, oldest or newest first', async () => {
    const api = signedIn();
    const id = addNovel(api, { chapters: 1_200 });
    const { user } = renderApp(`/novels/${id}`);

    await screen.findByText('Chapter 1: Part 1');
    expect(screen.getAllByRole('link', { name: /^\d/ })).toHaveLength(50);
    const pageSelect = screen.getByRole('combobox', { name: 'Page' });
    expect(within(pageSelect).getAllByRole('option')).toHaveLength(24);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Chapter 51: Part 51')).toBeVisible();
    expect(pageSelect).toHaveValue('2');

    await user.selectOptions(pageSelect, '24');
    expect(await screen.findByText('Chapter 1200: Part 1200')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Oldest first' }));
    expect(await screen.findByRole('button', { name: 'Newest first' })).toBeVisible();
    // Changing the order starts again from the first page: the newest chapters.
    expect(await screen.findByText('Chapter 1200: Part 1200')).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Page' })).toHaveValue('1');
  });

  it('searches by title or number', async () => {
    const api = signedIn();
    const id = addNovel(api, { chapters: 120 });
    const { user } = renderApp(`/novels/${id}`);
    await screen.findByText('Chapter 1: Part 1');

    await user.type(
      screen.getByRole('searchbox', { name: 'Search chapters by title or number' }),
      '117',
    );
    expect(await screen.findByText('Chapter 117: Part 117')).toBeVisible();
    await waitFor(() => expect(screen.getAllByRole('link', { name: /^\d/ })).toHaveLength(1));

    const search = screen.getByRole('searchbox', { name: 'Search chapters by title or number' });
    await user.clear(search);
    await user.type(search, 'nothing like this');
    expect(await screen.findByText('No chapter matches “nothing like this”.')).toBeVisible();
  });

  it('marks read, NEW and failed chapters in words, not colour alone', async () => {
    const api = signedIn();
    const id = addNovel(api, {
      chapters: 5,
      read: [1, 2],
      newChapters: [5],
      failed: [4],
      library: {},
    });
    renderApp(`/novels/${id}`);

    const link = async (number: number) =>
      screen.findByRole('link', { name: new RegExp(`^${number}\\s*Chapter ${number}:`) });
    expect(await link(1)).toHaveTextContent('Read');
    expect(await link(3)).not.toHaveTextContent(/Read|New|Download failed/);
    expect(await link(4)).toHaveTextContent('Download failed');
    expect(await link(5)).toHaveTextContent('New');
    expect(await link(2)).toHaveAttribute('href', `/reader/${id}/2`);
  });
});

describe('checking a novel for updates', () => {
  const SLOW = { timeout: 6_000 };

  it('follows the check and shows the new chapters it found', async () => {
    const api = signedIn();
    const id = addNovel(api, { title: 'The Long Road', chapters: 10, library: {} });
    api.checkScript = [
      { status: 'running', progressMessage: 'Checking Royal Road for new chapters…' },
      { status: 'completed', novelsChecked: 1, newChaptersFound: 2, progressPercent: 100 },
    ];
    const { user } = renderApp(`/novels/${id}`);

    await screen.findByRole('heading', { level: 1, name: 'The Long Road' });
    expect(screen.queryByRole('link', { name: /new chapter/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Check for updates' }));

    expect(await screen.findByText('Waiting to start…')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Checking for updates…' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(
      await screen.findByText('Checking Royal Road for new chapters…', {}, SLOW),
    ).toBeVisible();
    expect(await screen.findByText(/Found 2 new chapters/, {}, SLOW)).toBeVisible();

    // The novel, its chapter list, the library and the sidebar count all catch up.
    expect(await screen.findByText('Chapter 12: Part 12')).toBeVisible();
    expect(screen.getByRole('link', { name: '2 new chapters' })).toBeVisible();
    expect(await screen.findByRole('link', { name: 'My Library, 2 new chapters' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Check for updates' })).not.toHaveAttribute(
      'aria-disabled',
    );
    expect(api.calls.filter((call) => call === `POST /novels/${id}/update-check`)).toHaveLength(1);
  }, 15_000);

  it('says so when there is nothing new', async () => {
    const api = signedIn();
    const id = addNovel(api, { chapters: 3 });
    api.checkScript = [{ status: 'completed', novelsChecked: 1, newChaptersFound: 0 }];
    const { user } = renderApp(`/novels/${id}`);

    await user.click(await screen.findByRole('button', { name: 'Check for updates' }));
    expect(
      await screen.findByText('No new chapters since the last check.', {}, SLOW),
    ).toBeVisible();
  }, 15_000);

  it('explains a failed check in plain language', async () => {
    const api = signedIn();
    const id = addNovel(api, { title: 'The Long Road', library: {} });
    const message = "We couldn't reach Royal Road to check for new chapters.";
    api.checkScript = [
      {
        status: 'failed',
        error: {
          type: 'network_error',
          message: "We couldn't reach Royal Road after several attempts. Please try again later.",
        },
        errors: [{ novelId: id, title: 'The Long Road', type: 'network_error', message }],
      },
    ];
    const { user } = renderApp(`/novels/${id}`);

    await user.click(await screen.findByRole('button', { name: 'Check for updates' }));
    const note = await screen.findByText('The last check for new chapters failed.', {}, SLOW);
    expect(note.closest('p')).toHaveTextContent(message);
  }, 15_000);

  it('shows a check someone else started, and its outcome', async () => {
    const api = signedIn();
    const id = addNovel(api, { title: 'Shared Road', chapters: 4 });
    api.updateChecks.set(id, {
      id: 'run-elsewhere',
      trigger: 'manual',
      status: 'running',
      novel: { id, title: 'Shared Road' },
      novelsChecked: 0,
      newChaptersFound: 0,
      errors: [],
      progressMessage: 'Checking Royal Road for new chapters…',
      progressPercent: 10,
      error: null,
      createdAt: '2026-09-27T10:00:00.000Z',
      startedAt: '2026-09-27T10:00:01.000Z',
      finishedAt: null,
    });
    api.checkScript = [{ status: 'completed', novelsChecked: 1, newChaptersFound: 1 }];
    renderApp(`/novels/${id}`);

    expect(await screen.findByText('Checking Royal Road for new chapters…')).toBeVisible();
    expect(await screen.findByText(/Found 1 new chapter\./, {}, SLOW)).toBeVisible();
    expect(await screen.findByText('Chapter 5: Part 5')).toBeVisible();
  }, 15_000);

  it('offers no check for an EPUB import', async () => {
    const api = signedIn();
    const id = addNovel(api, { title: 'From a File', epub: true });
    renderApp(`/novels/${id}`);

    await screen.findByRole('heading', { level: 1, name: 'From a File' });
    expect(screen.queryByRole('button', { name: /Check for updates/ })).not.toBeInTheDocument();
    expect(api.calls).not.toContain(`GET /novels/${id}/update-check`);
  });
});
