import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';
import { PREFERENCES_STORAGE_KEY } from '../features/preferences/store';
import { media } from '../test/setup';
import { useTheme } from './theme';
import { ThemeProvider } from './ThemeProvider';

function Probe() {
  const { preference, theme, showPreference } = useTheme();
  return (
    <>
      <output>{`${preference}:${theme}`}</output>
      <button type="button" onClick={() => showPreference('black')}>
        black
      </button>
      <button type="button" onClick={() => showPreference('system')}>
        system
      </button>
    </>
  );
}

const shown = () => screen.getByRole('status').textContent;

/** This device's copy of the preferences, holding `theme`. */
const mirror = (theme: string) =>
  localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ preferences: { theme } }));

const renderProbe = () =>
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );

describe('one theme for every page', () => {
  it("follows the device's light or dark setting when nothing is saved", () => {
    media.matches = true; // prefers dark
    renderProbe();
    expect(shown()).toBe('system:dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it("starts from this device's copy of the preferences, and ignores unknown values", () => {
    mirror('sepia');
    const { unmount } = renderProbe();
    expect(shown()).toBe('sepia:sepia');
    unmount();

    mirror('neon');
    renderProbe();
    expect(shown()).toBe('system:light');
  });

  it('shows the saved theme it is given, the device\'s for "system"', () => {
    renderProbe();
    act(() => screen.getByRole('button', { name: 'black' }).click());
    expect(shown()).toBe('black:black');
    expect(document.documentElement.dataset.theme).toBe('black');

    media.matches = true;
    act(() => screen.getByRole('button', { name: 'system' }).click());
    expect(shown()).toBe('system:dark');
  });

  it("gives the browser's bars the page's paper", () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
    document.documentElement.style.setProperty('--paper', '#123456');
    renderProbe();
    expect(meta.content).toBe('#123456');
    document.documentElement.style.removeProperty('--paper');
    meta.remove();
  });
});

/** Runs the inline script of index.html, as the browser does before the first paint. */
function prePaint(path: string) {
  window.history.pushState({}, '', path);
  const script = /<script>([\s\S]*?)<\/script>/.exec(indexHtml)?.[1];
  if (!script) throw new Error('index.html has no inline script');
  delete document.documentElement.dataset.theme;
  const element = document.createElement('script');
  // jsdom runs the script in a global of its own, without the test setup's matchMedia.
  const device = `var matchMedia = function () { return { matches: ${String(media.matches)} }; };`;
  element.textContent = device + script;
  document.head.append(element); // jsdom runs it, like a browser
  element.remove();
  return document.documentElement.dataset.theme;
}

describe('the pre-paint script in index.html', () => {
  afterEach(() => window.history.pushState({}, '', '/'));

  it('reads the same copy of the preferences as the app', () => {
    expect(indexHtml).toContain(`localStorage.getItem('${PREFERENCES_STORAGE_KEY}')`);
  });

  it('paints every page, the reader included, in the saved theme', () => {
    mirror('dark');
    expect(prePaint('/library')).toBe('dark');
    expect(prePaint('/reader/novel-1/12')).toBe('dark');
    mirror('black');
    expect(prePaint('/novels/novel-1')).toBe('black');
    mirror('sepia');
    expect(prePaint('/settings')).toBe('sepia');
  });

  it('follows the device for "system", and without a usable copy', () => {
    mirror('system');
    expect(prePaint('/library')).toBe('light');
    media.matches = true;
    expect(prePaint('/library')).toBe('dark');
    mirror('neon');
    expect(prePaint('/library')).toBe('dark');
    localStorage.setItem(PREFERENCES_STORAGE_KEY, '{not json');
    expect(prePaint('/library')).toBe('dark');
    localStorage.removeItem(PREFERENCES_STORAGE_KEY);
    expect(prePaint('/library')).toBe('dark');
  });
});
