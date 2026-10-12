import { TERM_TEXT_MAX, type Term } from '@webnovel-hub/shared';
import { Replace } from 'lucide-react';
import { type RefObject, useEffect, useEffectEvent, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './Terms.module.css';
import { TermDialog } from './TermDialog';

/** How long a selection has to stay put before the button shows. */
const SETTLE_MS = 150;
/** Room the button needs under the selection; with less, it goes above. */
const BUTTON_ROOM = 64;

interface Picked {
  /** The selected text, for a new term. */
  text: string;
  /** The term the selection touches, if any: it is edited instead. */
  term: Term | null;
  /** Where the button goes, in page coordinates. */
  top: number;
  left: number;
  above: boolean;
}

interface TermSelectionProps {
  /** The chapter's text: only selections inside it count. */
  containerRef: RefObject<HTMLElement | null>;
  novel: { id: string; title: string };
  terms: readonly Term[];
}

/** What the current selection in `container` offers, or null when it offers nothing. */
function pick(container: HTMLElement, terms: readonly Term[]): Picked | null {
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  const raw = selection.toString().trim();
  // A term is a few words on one line, not a passage.
  if (raw === '' || raw.length > TERM_TEXT_MAX || /[\r\n]/.test(raw)) return null;

  const touched = [...container.querySelectorAll<HTMLElement>('[data-term-id]')].find((span) =>
    selection.containsNode(span, true),
  );
  const term = terms.find((candidate) => candidate.id === touched?.dataset.termId) ?? null;

  const rect = range.getBoundingClientRect();
  const above = rect.bottom + BUTTON_ROOM > window.innerHeight;
  const middle = rect.left + rect.width / 2;
  return {
    text: raw.replace(/\s+/g, ' '),
    term,
    top: (above ? rect.top : rect.bottom) + window.scrollY,
    left: Math.min(Math.max(middle, 72), window.innerWidth - 72) + window.scrollX,
    above,
  };
}

/**
 * The reader's "Add term" button: selecting a few words of the chapter shows it next to
 * them, and selecting text a term put there shows "Edit term" instead. It opens the term's
 * dialog.
 */
export function TermSelection({ containerRef, novel, terms }: TermSelectionProps) {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [editing, setEditing] = useState<Picked | null>(null);
  // Set while the button is being pressed, so the selection clearing under a tap
  // doesn't take the button away before its click.
  const pressing = useRef(false);

  const onSelectionChange = useEffectEvent(() => {
    const container = containerRef.current;
    const next = container ? pick(container, terms) : null;
    if (next === null && pressing.current) return;
    setPicked(next);
  });
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const listener = () => {
      clearTimeout(timer);
      timer = setTimeout(onSelectionChange, SETTLE_MS);
    };
    document.addEventListener('selectionchange', listener);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('selectionchange', listener);
    };
  }, []);

  const open = () => {
    pressing.current = false;
    if (!picked) return;
    setEditing(picked);
    setPicked(null);
  };

  return (
    <>
      {picked &&
        createPortal(
          <div
            className={styles.popup}
            style={{ top: picked.top, left: picked.left }}
            data-above={picked.above || undefined}
          >
            <button
              type="button"
              className={styles.popupButton}
              // Keeps the selection (and so the button) while it is pressed.
              onMouseDown={(event) => event.preventDefault()}
              onPointerDown={() => {
                pressing.current = true;
              }}
              onPointerCancel={() => {
                pressing.current = false;
              }}
              onClick={open}
            >
              <Replace aria-hidden="true" />
              {picked.term ? 'Edit term' : 'Add term'}
            </button>
          </div>,
          document.body,
        )}
      <TermDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        term={editing?.term ?? null}
        novel={novel}
        original={editing?.text}
      />
    </>
  );
}
