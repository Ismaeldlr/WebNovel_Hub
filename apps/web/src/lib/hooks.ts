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

/**
 * Calls `onDismiss` when the user presses Escape or clicks outside every element in
 * `inside`, while `active`. For menus and popovers.
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
