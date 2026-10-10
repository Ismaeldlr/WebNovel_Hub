import { type RefObject, useEffect, useRef, useState } from 'react';

/** How far down the page the bars may start hiding, and how far a scroll must go. */
const HIDE_AFTER_PX = 80;
const MIN_SCROLL_PX = 8;

/** Calls `onScroll` at most once a frame while the page scrolls or resizes, and once now. */
function useFrameScroll(onScroll: () => void, deps: unknown[]) {
  useEffect(() => {
    let frame = 0;
    const run = () => {
      frame = 0;
      onScroll();
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(run);
    };
    onScroll();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
    };
    // The callers pass what `onScroll` depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * How far down the chapter the reader is, drawn on the element `ref` points to (its width
 * scaled from 0 to 1) straight from scroll events, without re-rendering.
 */
export function useReadingProgress(): RefObject<HTMLSpanElement | null> {
  const ref = useRef<HTMLSpanElement>(null);
  useFrameScroll(() => {
    const room = document.documentElement.scrollHeight - window.innerHeight;
    const done = room > 0 ? Math.min(1, window.scrollY / room) : 0;
    ref.current?.style.setProperty('transform', `scaleX(${done})`);
  }, []);
  return ref;
}

/**
 * Whether the reader's bars make way for the text.
 * With `autoHide` (phones) they slide away while reading down and come back on scrolling
 * up, near the end, when something in them gets focus (`show`), or on a tap (`toggle`).
 */
export function useBarsHidden(autoHide: boolean) {
  const [hidden, setHidden] = useState(false);
  const last = useRef(0);
  useFrameScroll(() => {
    const y = window.scrollY;
    if (!autoHide || Math.abs(y - last.current) < MIN_SCROLL_PX) return;
    const room = document.documentElement.scrollHeight - window.innerHeight;
    setHidden(y > last.current && y > HIDE_AFTER_PX && y < room - 24);
    last.current = y;
  }, [autoHide]);

  return {
    hidden: autoHide && hidden,
    show: () => setHidden(false),
    toggle: () => setHidden((current) => !current),
  };
}
