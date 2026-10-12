import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { addNovel, fakeApi } from '../../test/fakeApi';
import { renderApp } from '../../test/renderApp';

const signedIn = () => fakeApi();
const location = () => screen.getByTestId('location').textContent;
const heading = () => screen.getByRole('heading', { level: 1 });
const readerCalls = (api: ReturnType<typeof signedIn>) =>
  api.calls.filter((call) => call.includes('/reader/'));

describe('reader', () => {
  it('fetches an unfetched chapter, then shows its paragraphs without the app shell', async () => {
    const api = signedIn();
    const id = addNovel(api, { title: 'Mother of Learning', chapters: 10 });
    renderApp(`/reader/${id}/4`);

    // Fetching: the reader waits and polls.
    expect(await screen.findByText('Fetching from Royal Road…')).toBeVisible();
    expect(screen.getByText('Fetching from Royal Road…').closest('[role="status"]')).not.toBeNull();
    expect(heading()).toHaveTextContent('Chapter 4: Part 4');

    // The text arrives on a later poll, as paragraphs of text.
    expect(
      await screen.findByText('The opening of chapter 4.', {}, { timeout: 4000 }),
    ).toBeVisible();
    const second = screen.getByText(/A second paragraph,/);
    expect(second.tagName).toBe('P');
    expect(second.querySelector('br')).not.toBeNull();
    expect(document.title).toBe('Chapter 4: Part 4 · Mother of Learning · Webnovel Hub');

    // Distraction-free: no sidebar, no search, one h1.
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('link', { name: /My Library/ })).toBeNull();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText('Mother of Learning', { selector: 'a' })).toHaveAttribute(
      'href',
      `/novels/${id}`,
    );

    // Marked read once for this view.
    await waitFor(() => expect(api.reads).toEqual([`${id}/4`]));
  });

  it('turns pages with the controls and the arrow keys, but not while typing', async () => {
    const api = signedIn();
    const id = addNovel(api, { chapters: 3, fetched: [1, 2, 3] });
    const { user } = renderApp(`/reader/${id}/2`);
    expect(await screen.findByText('The opening of chapter 2.')).toBeVisible();

    const [top] = screen.getAllByRole('navigation', { name: /Chapter navigation/ });
    // The chapter list opens over the reader, at this chapter (§5.4).
    await user.click(within(top!).getByRole('button', { name: 'Chapters' }));
    const list = screen.getByRole('dialog', { name: 'Chapters' });
    expect(await within(list).findByRole('link', { current: 'page' })).toHaveTextContent(
      'Chapter 2: Part 2',
    );
    await user.click(within(list).getByRole('button', { name: 'Close chapters' }));
    expect(screen.queryByRole('dialog', { name: 'Chapters' })).toBeNull();

    await user.click(within(top!).getByRole('link', { name: 'Next chapter: Chapter 3: Part 3' }));
    expect(await screen.findByText('The opening of chapter 3.')).toBeVisible();
    expect(location()).toBe(`/reader/${id}/3`);
    expect(heading()).toHaveTextContent('Chapter 3: Part 3');
    expect(heading()).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(await screen.findByText('The opening of chapter 2.')).toBeVisible();
    expect(location()).toBe(`/reader/${id}/2`);
    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(location()).toBe(`/reader/${id}/3`));

    // Keys typed into a field stay there.
    const field = document.createElement('input');
    document.body.append(field);
    field.focus();
    fireEvent.keyDown(field, { key: 'ArrowLeft' });
    expect(location()).toBe(`/reader/${id}/3`);
    field.remove();

    // Each chapter shown was marked read once.
    await waitFor(() => expect(api.reads).toEqual([`${id}/2`, `${id}/3`, `${id}/2`, `${id}/3`]));
  });

  it('says so at the end of the novel, and disables what is out of reach', async () => {
    const api = signedIn();
    const id = addNovel(api, { chapters: 2, fetched: [1, 2] });
    const { user } = renderApp(`/reader/${id}/2`);

    expect(await screen.findByRole('heading', { name: "You're caught up" })).toBeVisible();
    expect(screen.getByText(/No further chapters yet/)).toBeVisible();
    for (const next of screen.getAllByRole('button', { name: 'Next' })) {
      expect(next).toBeDisabled();
    }
    // → at the last chapter goes nowhere.
    await user.keyboard('{ArrowRight}');
    expect(location()).toBe(`/reader/${id}/2`);

    await user.keyboard('{ArrowLeft}');
    expect(await screen.findByText('The opening of chapter 1.')).toBeVisible();
    expect(screen.queryByRole('heading', { name: "You're caught up" })).toBeNull();
    for (const previous of screen.getAllByRole('button', { name: 'Previous' })) {
      expect(previous).toBeDisabled();
    }
  });

  it('shows a failed fetch with its message, and tries again', async () => {
    const api = signedIn();
    const id = addNovel(api, { chapters: 3, failed: [2] });
    const { user } = renderApp(`/reader/${id}/2`);

    const failedHeading = await screen.findByRole('heading', {
      name: "This chapter couldn't be fetched",
    });
    const alert = failedHeading.closest<HTMLElement>('[role="alert"]');
    if (!alert) throw new Error('the failure is not announced');
    expect(within(alert).getByText("We couldn't reach Royal Road.")).toBeVisible();
    expect(api.reads).toEqual([]);

    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Fetching from Royal Road…')).toBeVisible();
    expect(api.calls).toContain(`POST /reader/${id}/chapters/2/fetch`);
    expect(
      await screen.findByText('The opening of chapter 2.', {}, { timeout: 4000 }),
    ).toBeVisible();
  });

  it('shows a fetch that fails for good while the reader waits', async () => {
    const api = signedIn();
    api.fetchOutcome = 'fail';
    const id = addNovel(api, { chapters: 3 });
    renderApp(`/reader/${id}/1`);
    expect(await screen.findByText('Fetching from Royal Road…')).toBeVisible();
    expect(
      await screen.findByRole(
        'heading',
        { name: "This chapter couldn't be fetched" },
        { timeout: 4000 },
      ),
    ).toBeVisible();
    expect(screen.getByText(/after several attempts/)).toBeVisible();
  });

  it('offers the last chapter when the chapter does not exist', async () => {
    const api = signedIn();
    const id = addNovel(api, { chapters: 10 });
    renderApp(`/reader/${id}/99`);
    expect(
      await screen.findByRole('heading', { level: 1, name: "There's no chapter 99" }),
    ).toBeVisible();
    expect(screen.getByText('This novel has 10 chapters so far.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open chapter 10' })).toHaveAttribute(
      'href',
      `/reader/${id}/10`,
    );
  });

  it('says when the novel is not in the library', async () => {
    signedIn();
    renderApp('/reader/no-such-novel/1');
    expect(
      await screen.findByRole('heading', { level: 1, name: "This novel isn't in your library" }),
    ).toBeVisible();
  });

  it('rejects an address that is not a chapter number without asking the library', async () => {
    const api = signedIn();
    const id = addNovel(api, { chapters: 3 });
    renderApp(`/reader/${id}/first`);
    expect(
      await screen.findByRole('heading', { level: 1, name: "That isn't a chapter number" }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open chapter 1' })).toHaveAttribute(
      'href',
      `/reader/${id}/1`,
    );
    expect(readerCalls(api)).toEqual([]);
  });
});

describe('reader progress and library', () => {
  it('moves the saved progress, which Continue then uses', async () => {
    const api = signedIn();
    const id = addNovel(api, {
      title: 'The Wandering Inn',
      chapters: 12,
      fetched: [8],
      library: {
        lastReadChapterNumber: 2,
        furthestChapterNumber: 5,
        lastReadAt: '2026-09-20T00:00:00Z',
      },
      newChapters: [8],
    });
    const { user } = renderApp(`/reader/${id}/8`);
    expect(await screen.findByText('The opening of chapter 8.')).toBeVisible();
    await waitFor(() =>
      expect(api.library.get(id)).toMatchObject({
        lastReadChapterNumber: 8,
        furthestChapterNumber: 8,
        newChapterCount: 0,
      }),
    );

    await user.click(screen.getByRole('link', { name: 'Back to The Wandering Inn' }));
    expect(await screen.findByRole('link', { name: 'Continue at chapter 8' })).toHaveAttribute(
      'href',
      `/reader/${id}/8`,
    );
    expect(screen.getByText('Chapter 8 of 12')).toBeVisible();
  });
});

describe('chapter text', () => {
  it('renders markup in the text as text', async () => {
    const api = signedIn();
    const id = addNovel(api, { chapters: 1, fetched: [1] });
    api.contents.set(`${id}-c1`, '<img src=x onerror=alert(1)>\n\n<b>bold?</b>');
    renderApp(`/reader/${id}/1`);
    expect(await screen.findByText('<b>bold?</b>')).toBeVisible();
    expect(document.querySelector('img')).toBeNull();
  });
});
