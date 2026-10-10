import { HISTORY_RANGES, type HistoryRange } from '@webnovel-hub/shared';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { type HistoryFilter, historyApi } from '../../api/history';
import { queryKeys } from '../../app/queryClient';
import { StatTiles } from '../../components/StatTiles';
import { Select, Tabs, tabPanelProps } from '../../components/ui';
import { PageHeader } from '../pages/PageHeader';
import { ChapterHistory } from './ChapterHistory';
import styles from './HistoryPage.module.css';
import {
  type HistoryParams,
  RANGE_LABELS,
  historySearch,
  readHistoryParams,
} from './historyParams';
import { NovelFilter } from './NovelFilter';
import { NovelHistory } from './NovelHistory';

/**
 * Reading History: a summary, then the chapters read, by day, or the
 * novels read, with a range and (for chapters) a novel filter, all kept in the address.
 */
export function HistoryPage() {
  const [params, setParams] = useSearchParams();
  const state = readHistoryParams(params);
  const update = (changes: Partial<HistoryParams>) =>
    setParams(historySearch({ ...state, ...changes }), { replace: true });

  const filter: HistoryFilter = {
    range: state.range,
    novelId: state.view === 'chapters' ? state.novelId : null,
  };
  const stats = useQuery({
    queryKey: queryKeys.historyStats(filter),
    queryFn: ({ signal }) => historyApi.stats(filter, signal),
  });

  return (
    <>
      <PageHeader title="Reading History" lead="Every chapter you've read, by day and by novel." />
      <div className={styles.page}>
        {stats.data && (
          <StatTiles
            label="History summary"
            tiles={[
              { label: 'Chapters read', value: stats.data.chaptersRead.toLocaleString() },
              { label: 'Novels', value: stats.data.novelsRead.toLocaleString() },
              { label: 'Authors', value: stats.data.authorsRead.toLocaleString() },
            ]}
          />
        )}

        <div className={styles.controls}>
          <Tabs
            label="Show history"
            idPrefix="history"
            tabs={[
              { id: 'chapters', label: 'By chapter' },
              { id: 'novels', label: 'By novel' },
            ]}
            selected={state.view}
            onSelect={(view) => update({ view })}
          />
          <div className={styles.filters}>
            <Select
              label="Range"
              value={state.range}
              options={HISTORY_RANGES.map((range) => ({
                value: range,
                label: RANGE_LABELS[range],
              }))}
              onChange={(event) => update({ range: event.target.value as HistoryRange })}
            />
            {state.view === 'chapters' && (
              <NovelFilter selected={state.novelId} onSelect={(novelId) => update({ novelId })} />
            )}
          </div>
        </div>

        <div {...tabPanelProps('history', state.view)} className={styles.panel}>
          {state.view === 'chapters' ? (
            <ChapterHistory
              filter={filter}
              onClearFilters={() => update({ range: 'all', novelId: null })}
            />
          ) : (
            <NovelHistory range={state.range} onShowAll={() => update({ range: 'all' })} />
          )}
        </div>
      </div>
    </>
  );
}
