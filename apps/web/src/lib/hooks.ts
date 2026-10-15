import {
  type RefObject,
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useState,
  useSyncExternalStore,
} from 'react';

/** How long a search box waits after the last keystroke before searching. */
export const SEARCH_DELAY_MS = 300;

/**
 * A search box that searches as the reader types, a moment after they stop (real-time
 * search without a request per keystroke). `applied` is the search in effect, e.g. from
 * the address, and `apply` changes it with the trimmed text. When `applied` changes from
 * elsewhere (cleared, restored, a link), the box shows it.
 */
export function useSearchText(
  applied: string,
  apply: (text: string) => void,
  delayMs = SEARCH_DELAY_MS,
) {
  const [text, setText] = useState(applied);
  const [shown, setShown] = useState(applied);
  if (applied !== shown) {
    setShown(applied);
    // The box's own search coming back must not undo what was typed since (a trailing space).
    if (text.trim() !== applied) setText(applied);
  }

  const applyLater = useEffectEvent(apply);
  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed === applied) return;
    const timer = window.setTimeout(() => applyLater(trimmed), delayMs);
    return () => window.clearTimeout(timer);
  }, [text, applied, delayMs]);

  return [text, setText] as const;
}

/** `value`, once it has stopped changing for `delayMs`. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** Whether a CSS media query matches, kept current as the window changes. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

/** Sets the document title: "<title> · Webnovel Hub". */
export function usePageTitle(title: string): void {
  const showInShell = useContext(PageTitleContext);
  useEffect(() => {
    document.title = `${title} · Webnovel Hub`;
    showInShell?.(title);
  }, [title, showInShell]);
}

/** Where usePageTitle passes the title on to the app shell (its phone top bar shows it). */
export const PageTitleContext = createContext<((title: string) => void) | null>(null);

/** What a page asks of the phone top bar besides its title. */
export interface PageBar {
  /**
   * A back button in place of the menu button, for pages below another page; it goes up
   * to that page (app/back.ts).
   */
  back?: boolean;
  /** No background and no title, so the top of the page shows through. */
  clear?: boolean;
}

/** Phones: the place in the top bar where a page puts its own buttons (see BarActions). */
export const PageBarSlotContext = createContext<HTMLElement | null>(null);

/** Where usePageBar passes its wishes on to the app shell. */
export const PageBarContext = createContext<((bar: PageBar) => void) | null>(null);

/**
 * Whether the element has scrolled up under the sticky top bar (once `enabled`, i.e. once
 * the element is on the page).
 */
export function useUnderTopBar(ref: RefObject<HTMLElement | null>, enabled = true): boolean {
  const [under, setUnder] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element || typeof IntersectionObserver === 'undefined') return;
    const bar = document.querySelector('[data-topbar]');
    const barBottom = Math.round(bar?.getBoundingClientRect().bottom ?? 0);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setUnder(!entry.isIntersecting && entry.boundingClientRect.top < barBottom);
      },
      { rootMargin: `-${barBottom}px 0px 0px 0px` },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, enabled]);
  return under;
}

/** Sets the phone top bar's look while the page is shown. */
export function usePageBar({ back = false, clear = false }: PageBar): void {
  const setBar = useContext(PageBarContext);
  useEffect(() => {
    setBar?.({ back, clear });
  }, [setBar, back, clear]);
  useEffect(() => () => setBar?.({}), [setBar]);
}

/** What the phone's back button closes before it leaves the page, the latest open last. */
const backLayers: { close: () => void }[] = [];

/**
 * While `active`, the phone's back button calls `onBack` (closing the menu, dialog or
 * drawer) instead of leaving the page.
 */
export function useBackLayer(active: boolean, onBack: () => void): void {
  const back = useEffectEvent(onBack);
  useEffect(() => {
    if (!active) return;
    const layer = { close: () => back() };
    backLayers.push(layer);
    return () => {
      backLayers.splice(backLayers.indexOf(layer), 1);
    };
  }, [active]);
}

/** Closes the menu, dialog or drawer opened last; false when none is open. */
export function closeBackLayer(): boolean {
  const top = backLayers.at(-1);
  top?.close();
  return top !== undefined;
}

/**
 * Calls `onDismiss` when the user presses Escape or clicks outside every element in
 * `inside`, while `active` (the phone's back button counts as Escape). For menus and
 * popovers.
 */
export function useDismiss(
  active: boolean,
  inside: RefObject<HTMLElement | null>[],
  onDismiss: (reason: 'escape' | 'outside') => void,
): void {
  // Always the latest callback and refs, without re-subscribing on every render.
  const dismiss = useEffectEvent(onDismiss);
  const isInside = useEffectEvent((target: Node) =>
    inside.some((ref) => ref.current?.contains(target)),
  );

  useBackLayer(active, () => onDismiss('escape'));
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismiss('escape');
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!isInside(event.target as Node)) dismiss('outside');
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [active]);
}
