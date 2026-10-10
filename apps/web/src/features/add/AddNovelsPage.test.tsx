import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { addNovel, fakeApi } from '../../test/fakeApi';
import { renderApp } from '../../test/renderApp';

const URL = 'https://www.royalroad.com/fiction/21220/mother-of-learning';
const signedIn = () => fakeApi();
const SLOW = { timeout: 6_000 };

describe('Add Novels by URL', () => {
  it('recognises the site as the reader types, then follows the import to the novel', async () => {
    const api = signedIn();
    const novelId = addNovel(api, {
      title: 'Mother of Learning',
      sourceUrl: 'https://www.royalroad.com/fiction/21220',
    });
    api.library.clear();
    api.nextJobScript = [
      { status: 'running', progressMessage: 'Found 108 chapters', progressPercent: 70 },
      {
        status: 'completed',
        progressPercent: 100,
        result: { novelId, title: 'Mother of Learning', chapterCount: 108, duplicate: false },
      },
    ];
    const { user } = renderApp('/add');

    const input = await screen.findByRole('textbox', { name: 'Novel address' });
    await screen.findByRole('heading', { name: 'Supported sites' }); // the sites have loaded
    await user.type(input, URL);
    const form = input.closest('form') as HTMLElement;
    expect(await within(form).findByText('Royal Road', { selector: 'span' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByRole('heading', { name: 'Importing from Royal Road' })).toBeVisible();
    expect(screen.getByRole('progressbar', { name: 'Import progress' })).toBeVisible();
    expect(await screen.findByText('Found 108 chapters', {}, SLOW)).toBeVisible();

    expect(
      await screen.findByRole('heading', { name: 'Added “Mother of Learning”' }, SLOW),
    ).toBeVisible();
    expect(screen.getByText(/108 chapters are ready/)).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'View novel' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mother of Learning' }),
    ).toBeVisible();
  }, 15_000);

  it('says when WTR Lab needs a sign-in, and offers machine translation instead', async () => {
    const api = signedIn();
    api.wtrLabSignedIn = false;
    const { user } = renderApp('/add');
    await screen.findByRole('heading', { name: 'Supported sites' });
    await user.type(
      screen.getByRole('textbox', { name: 'Novel address' }),
      'https://wtr-lab.com/en/novel/2/lin-yuanxing',
    );

    expect(await screen.findByText("You're not signed in to WTR Lab")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: "I don't care" }));
    await user.click(await screen.findByRole('button', { name: 'Yes, use MTL' }));

    expect(
      await screen.findByText('Those chapters will come machine-translated'),
    ).toBeInTheDocument();
    await waitFor(
      () => expect(api.preferenceSaves).toEqual([{ wtrLabMachineTranslation: true }]),
      SLOW,
    );
  });

  it('explains a failed import and offers to try again', async () => {
    const api = signedIn();
    api.nextJobScript = [
      {
        status: 'failed',
        error: {
          type: 'structure_changed',
          message: "Royal Road changed its page layout, so we couldn't read it.",
        },
      },
    ];
    const { user } = renderApp('/add');
    await user.type(await screen.findByRole('textbox', { name: 'Novel address' }), URL);
    await user.click(screen.getByRole('button', { name: 'Import' }));

    const heading = await screen.findByRole('heading', { name: "The import didn't work" }, SLOW);
    const alert = heading.closest<HTMLElement>('[role="alert"]') ?? heading;
    expect(alert).toHaveTextContent("Royal Road changed its page layout, so we couldn't read it.");
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Importing from Royal Road' })).toBeVisible();
    expect(api.calls.filter((call) => call === 'POST /import/url')).toHaveLength(2);
  }, 15_000);

  it('offers to open a novel already in the library (409)', async () => {
    const api = signedIn();
    const id = addNovel(api, { title: 'Mother of Learning', sourceUrl: URL, library: {} });
    const { user } = renderApp('/add');
    await user.type(await screen.findByRole('textbox', { name: 'Novel address' }), URL);
    await user.click(screen.getByRole('button', { name: 'Import' }));

    expect(
      await screen.findByText('“Mother of Learning” is already in your library.'),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('href', `/novels/${id}`);
  });

  it('lists every importable site, each opening its front page in a new tab', async () => {
    signedIn();
    renderApp('/add');
    const section = (await screen.findByRole('heading', { name: 'Supported sites' })).closest(
      'section',
    ) as HTMLElement;
    const links = within(section).getAllByRole('link');
    // By name, without EPUB (not a site) or sites without a front page.
    expect(links.map((link) => link.textContent)).toEqual([
      'Royal Roadroyalroad.com',
      'WTR Labwtr-lab.com',
    ]);
    expect(links[0]).toHaveAttribute('href', 'https://www.royalroad.com');
    expect(links[0]).toHaveAttribute('target', '_blank');
    expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(section).getByText(/one of these 2 sites/)).toBeVisible();
  });

  it('lists sites that are still a work in progress apart', async () => {
    signedIn();
    renderApp('/add');
    const section = (await screen.findByRole('heading', { name: 'Work in progress' })).closest(
      'section',
    ) as HTMLElement;
    expect(
      within(section)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Ranobesranobes.net']);
    expect(within(section).getByText(/may fail/)).toBeVisible();
  });

  it('refuses unsupported and malformed addresses without calling the API', async () => {
    const api = signedIn();
    const { user } = renderApp('/add');
    const input = await screen.findByRole('textbox', { name: 'Novel address' });
    await screen.findByRole('heading', { name: 'Supported sites' });

    await user.type(input, 'https://www.example.com/story/1');
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(
      screen.getByText(
        "Webnovel Hub can't import from www.example.com. The supported sites are listed below.",
      ),
    ).toHaveAttribute('role', 'alert');
    expect(input).toHaveAttribute('aria-invalid', 'true');

    await user.clear(input);
    await user.type(input, 'not a web address');
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(screen.getByText(/That doesn't look like a web address/)).toHaveAttribute(
      'role',
      'alert',
    );
    expect(api.calls).not.toContain('POST /import/url');
  });

  it('lists recent imports with a link to each imported novel', async () => {
    const api = signedIn();
    const novelId = addNovel(api, { title: 'Sky Pride' });
    api.nextJobScript = [
      {
        status: 'completed',
        result: { novelId, title: 'Sky Pride', chapterCount: 407, duplicate: false },
      },
    ];
    const { user } = renderApp('/add');
    await user.type(await screen.findByRole('textbox', { name: 'Novel address' }), URL);
    await user.click(screen.getByRole('button', { name: 'Import' }));
    await screen.findByRole('heading', { name: 'Added “Sky Pride”' }, SLOW);

    const recent = await screen.findByRole('region', { name: 'Recent imports' });
    expect(await within(recent).findByRole('link', { name: 'Sky Pride' })).toHaveAttribute(
      'href',
      `/novels/${novelId}`,
    );
    expect(within(recent).getByText('Imported')).toBeVisible();
  }, 15_000);

  it('switches to the EPUB tab, which keeps its place in the address', async () => {
    signedIn();
    const { user } = renderApp('/add');
    await user.click(await screen.findByRole('tab', { name: 'From an EPUB file' }));
    expect(screen.getByRole('heading', { name: 'EPUB file' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Choose a file' })).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent('/add?from=epub');
  });
});
