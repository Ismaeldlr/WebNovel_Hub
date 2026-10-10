import { CHAPTER_PAGE_LIMITS, type ChapterOrder } from '@webnovel-hub/shared';
import { useState } from 'react';
import { useSearchParams } from 'react-router';

const PAGE_SIZE = CHAPTER_PAGE_LIMITS.default;

/** Where the list is: its page, order and search, and how to change them. */
export interface ChapterListState {
  page: number;
  order: ChapterOrder;
  q: string;
  update: (change: { page?: number; order?: ChapterOrder; q?: string }) => void;
}

/** Page, order and search live in the address, so Back and reloads keep them. */
export function useChapterParams(): ChapterListState {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const order: ChapterOrder = params.get('order') === 'desc' ? 'desc' : 'asc';
  const q = params.get('q') ?? '';
  const update = (change: { page?: number; order?: ChapterOrder; q?: string }) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        const set = (key: string, value: string | null) =>
          value === null ? next.delete(key) : next.set(key, value);
        if (change.page !== undefined) set('page', change.page > 1 ? String(change.page) : null);
        if (change.order !== undefined) set('order', change.order === 'desc' ? 'desc' : null);
        if (change.q !== undefined) set('q', change.q || null);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  };
  return { page, order, q, update };
}

/** The same, held by the view itself (the reader's chapter list), from the page of `chapter`. */
export function useLocalChapterState(chapter: number): ChapterListState {
  const [state, setState] = useState({
    page: Math.ceil(chapter / PAGE_SIZE),
    order: 'asc' as ChapterOrder,
    q: '',
  });
  return { ...state, update: (change) => setState((current) => ({ ...current, ...change })) };
}
