import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NAV_ITEMS } from './app/navigation';
import { fakeApi } from './test/fakeApi';
import { renderApp } from './test/renderApp';

const location = () => screen.getByTestId('location').textContent;

describe('opening the app', () => {
  it('opens on the library, with nothing to sign in to', async () => {
    fakeApi();
    renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'My Library' })).toBeVisible();
    expect(location()).toBe('/library');
    expect(screen.queryByText(/sign in/i)).toBeNull();
  });

  it("explains when the library can't be opened, and recovers on retry", async () => {
    const api = fakeApi({ unreachable: true });
    const { user } = renderApp('/library');
    const heading = await screen.findByRole('heading', {
      name: "Webnovel Hub can't open right now",
    });
    expect(heading.closest('[role="alert"]')).toHaveTextContent(
      "Webnovel Hub couldn't open your library.",
    );

    api.unreachable = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'My Library' })).toBeVisible();
  });
});

describe('app shell', () => {
  it('lists every page in the navigation and marks the current one', async () => {
    fakeApi();
    const { user } = renderApp('/library');
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(NAV_ITEMS.map((item) => item.label));
    expect(within(nav).getByRole('link', { name: 'My Library' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await user.click(within(nav).getByRole('link', { name: 'Exports' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Exports' })).toBeVisible();
    expect(within(nav).getByRole('link', { name: 'Exports' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(document.title).toBe('Exports · Webnovel Hub');
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
  });

  it('shows a not-found page for unknown addresses', async () => {
    fakeApi();
    renderApp('/no/such/page');
    expect(
      await screen.findByRole('heading', { name: "This page isn't on any shelf" }),
    ).toBeVisible();
  });

  it('has no authoring pages or links', async () => {
    fakeApi();
    renderApp('/library');
    await screen.findByRole('navigation', { name: 'Main' });
    expect(document.body.textContent).not.toMatch(/\b(write|draft|editor|compose|new chapter)\b/i);
  });
});
