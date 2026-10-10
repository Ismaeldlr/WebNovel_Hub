import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { formatRelativeTime } from '../../lib/format';
import { Button } from './Button';
import { ConfirmDialog } from './ConfirmDialog';
import { Menu, MenuItem } from './Menu';

function DialogHarness({ onConfirm = () => undefined }: { onConfirm?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Remove</Button>
      <ConfirmDialog
        open={open}
        title="Remove from your library?"
        confirmLabel="Remove"
        tone="danger"
        onConfirm={() => {
          onConfirm();
          setOpen(false);
        }}
        onCancel={() => setOpen(false)}
      >
        The novel stays in your library.
      </ConfirmDialog>
    </>
  );
}

describe('ConfirmDialog', () => {
  it('opens on the safe choice, and Escape cancels and returns focus', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<DialogHarness onConfirm={onConfirm} />);
    const trigger = screen.getByRole('button', { name: 'Remove' });

    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Remove from your library?' });
    expect(dialog).toHaveAccessibleDescription('The novel stays in your library.');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();

    // Browsers fire `cancel` on Escape; jsdom doesn't implement modal dialogs.
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(dialog).not.toHaveAttribute('open');
    expect(trigger).toHaveFocus();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirms', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<DialogHarness onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    const buttons = screen.getAllByRole('button', { name: 'Remove' });
    await user.click(buttons[buttons.length - 1] as HTMLElement);
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

describe('Menu', () => {
  function Harness({ onSelect }: { onSelect: (value: string) => void }) {
    return (
      <Menu
        trigger={(props) => (
          <button type="button" {...props}>
            Theme
          </button>
        )}
      >
        {['Paper', 'Sepia', 'Night'].map((name) => (
          <MenuItem key={name} checked={name === 'Sepia'} onSelect={() => onSelect(name)}>
            {name}
          </MenuItem>
        ))}
      </Menu>
    );
  }

  it('is fully keyboard-operable', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    const trigger = screen.getByRole('button', { name: 'Theme' });

    trigger.focus();
    await user.keyboard('{Enter}');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    // Opens on the checked choice.
    expect(screen.getByRole('menuitemradio', { name: 'Sepia' })).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: 'Night' })).toHaveFocus();
    await user.keyboard('{ArrowDown}'); // wraps around
    expect(screen.getByRole('menuitemradio', { name: 'Paper' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitemradio', { name: 'Night' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();

    await user.keyboard('{ArrowUp}'); // opens on the last item
    expect(screen.getByRole('menuitemradio', { name: 'Night' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('Night');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('closes on a click outside', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Harness onSelect={() => undefined} />
        <p>Elsewhere</p>
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Theme' }));
    expect(screen.getByRole('menu')).toBeVisible();
    await user.click(screen.getByText('Elsewhere'));
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('Button', () => {
  it('stays focusable but ignores clicks while busy', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button busy onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeEnabled();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-09-27T12:00:00Z');
  it.each([
    ['2026-09-27T11:59:40Z', 'just now'],
    ['2026-09-27T11:55:00Z', '5 minutes ago'],
    ['2026-09-27T09:00:00Z', '3 hours ago'],
    ['2026-09-26T12:00:00Z', 'yesterday'],
    ['2026-09-29T12:00:00Z', 'in 2 days'],
  ])('%s → %s', (date, expected) => {
    expect(formatRelativeTime(date, now)).toBe(expected);
  });
});
