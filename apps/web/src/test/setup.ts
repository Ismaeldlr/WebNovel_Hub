import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Pages load lazily, and every test file runs at once: under that load a page's first
// render can take longer than Testing Library's default second to appear.
configure({ asyncUtilTimeout: 3_000 });

// jsdom has no layout, media queries or modal dialogs; these stand-ins cover what the
// app uses. Tests that need every media query to match set `media.matches = true`.
export const media = { matches: false };

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string): MediaQueryList =>
    ({
      matches: media.matches,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList,
});

window.scrollTo = () => undefined;

// jsdom has no layout: a selection is a box at the top left.
const range: Partial<Pick<Range, 'getBoundingClientRect'>> = Range.prototype;
range.getBoundingClientRect ??= () => new DOMRect();

const dialog: Partial<Pick<HTMLDialogElement, 'showModal' | 'close'>> = HTMLDialogElement.prototype;
if (!dialog.showModal) {
  dialog.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
    // Like a browser: focus moves to the first focusable element inside.
    this.querySelector<HTMLElement>('button, [href], input, select, textarea')?.focus();
  };
  dialog.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  media.matches = false;
  vi.unstubAllGlobals();
});
