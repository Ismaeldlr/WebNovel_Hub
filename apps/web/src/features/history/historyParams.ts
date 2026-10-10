import { HISTORY_RANGES, type HistoryRange } from '@webnovel-hub/shared';

export type HistoryView = 'chapters' | 'novels';

/** What the History page shows; it lives in the address: `view`, `range`, `novel`. */
export interface HistoryParams {
  view: HistoryView;
  range: HistoryRange;
  /** The chapter view's novel filter. */
  novelId: string | null;
}

export const RANGE_LABELS: Record<HistoryRange, string> = {
  all: 'All time',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
};

const isRange = (value: string | null): value is HistoryRange =>
  (HISTORY_RANGES as readonly (string | null)[]).includes(value);

/** Reads the address; anything unknown falls back to the default. */
export function readHistoryParams(params: URLSearchParams): HistoryParams {
  const range = params.get('range');
  return {
    view: params.get('view') === 'novels' ? 'novels' : 'chapters',
    range: isRange(range) ? range : 'all',
    novelId: params.get('novel') || null,
  };
}

/** The address's query for these params, leaving out defaults. */
export function historySearch(state: HistoryParams): Record<string, string> {
  return {
    ...(state.view === 'novels' ? { view: 'novels' } : {}),
    ...(state.range === 'all' ? {} : { range: state.range }),
    ...(state.novelId === null ? {} : { novel: state.novelId }),
  };
}
