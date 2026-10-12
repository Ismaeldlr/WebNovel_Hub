import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

/** Opens the novel page's More menu and returns it. */
export async function openMore(user: UserEvent): Promise<HTMLElement> {
  await user.click(await screen.findByRole('button', { name: 'More actions' }));
  return screen.getByRole('menu');
}

/** Picks one of the novel page's More actions, waiting for it to be offered. */
export async function chooseMore(user: UserEvent, name: string): Promise<void> {
  const menu = await openMore(user);
  await user.click(await within(menu).findByRole('menuitem', { name }));
}
