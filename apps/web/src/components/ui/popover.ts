import { createContext, useContext } from 'react';

/** Closes the Popover around it (set by Popover in ./Menu). */
export const PopoverContext = createContext<(() => void) | null>(null);

/** Inside a Popover's panel: closes it and returns focus to its button. */
export function usePopoverClose(): () => void {
  const close = useContext(PopoverContext);
  if (!close) throw new Error('usePopoverClose must be used inside a Popover');
  return close;
}
