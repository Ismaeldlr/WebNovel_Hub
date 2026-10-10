import { Dialog } from '../../components/ui';
import { ChapterListView } from '../novel/ChapterList';
import { useLocalChapterState } from '../novel/chapterListState';

interface ChaptersSheetProps {
  novelId: string;
  totalChapters: number;
  /** The chapter being read: the list opens at its page, marked. */
  chapter: number;
  open: boolean;
  onClose: () => void;
}

/**
 * The novel's chapter list over the reader, so a chapter can be picked without leaving it
 * (§5.4): the novel page's list, holding its own page, search and order.
 */
export function ChaptersSheet({
  novelId,
  totalChapters,
  chapter,
  open,
  onClose,
}: ChaptersSheetProps) {
  const state = useLocalChapterState(chapter);
  return (
    <Dialog open={open} title="Chapters" placement="sheet" describe={false} onCancel={onClose}>
      <ChapterListView
        novelId={novelId}
        totalChapters={totalChapters}
        state={state}
        current={chapter}
        onOpen={onClose}
      />
    </Dialog>
  );
}
