import type { LibraryState, ReaderNovel } from '@webnovel-hub/shared';
import { BookOpen, ChevronDown, EllipsisVertical, Replace, Star } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useGoUp } from '../../app/back';
import { termsSearchPath } from '../../app/navigation';
import { IconButton, Menu, MenuHeader, MenuItem, MenuSeparator } from '../../components/ui';
import { STATUS_LABELS, STATUS_OPTIONS } from '../../lib/reading';
import { useSetFavorite, useSetStatus } from '../library/libraryActions';
import styles from './ReaderPage.module.css';

interface Props {
  novel: ReaderNovel;
  library: LibraryState | null;
  /**
   * Phones: a ⋮ button whose menu also holds the favourite, the novel's page and the
   * terms, so the top bar keeps to the novel and chapter.
   */
  compact?: boolean;
}

/** The status panel inside the reader (on phones, the reader's ⋮ menu). */
export function ReaderLibraryControl({ novel, library, compact = false }: Props) {
  const setStatus = useSetStatus();
  const setFavorite = useSetFavorite();
  const navigate = useNavigate();
  const goUp = useGoUp();
  if (!library && !compact) return null;

  const statusItems = library && (
    <>
      <MenuHeader>Library status</MenuHeader>
      {STATUS_OPTIONS.map(({ value, label: optionLabel }) => (
        <MenuItem
          key={value}
          checked={library.status === value}
          onSelect={() => setStatus.mutate({ novelId: novel.id, status: value })}
        >
          {optionLabel}
        </MenuItem>
      ))}
    </>
  );

  if (compact) {
    return (
      <Menu
        trigger={(props) => (
          <IconButton {...props} label="More">
            <EllipsisVertical aria-hidden="true" />
          </IconButton>
        )}
      >
        {statusItems}
        {library && (
          <>
            <MenuSeparator />
            <MenuItem
              icon={<Star aria-hidden="true" fill={library.isFavorite ? 'currentColor' : 'none'} />}
              onSelect={() =>
                setFavorite.mutate({ novelId: novel.id, isFavorite: !library.isFavorite })
              }
            >
              {library.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            </MenuItem>
          </>
        )}
        <MenuItem icon={<BookOpen aria-hidden="true" />} onSelect={() => void goUp()}>
          Novel page
        </MenuItem>
        <MenuItem
          icon={<Replace aria-hidden="true" />}
          onSelect={() => void navigate(termsSearchPath(novel.title))}
        >
          Terms
        </MenuItem>
      </Menu>
    );
  }

  const label = STATUS_LABELS[library!.status];
  return (
    <Menu
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className={styles.statusButton}
          aria-label={`Library status: ${label}`}
        >
          <span className={styles.statusCaption} aria-hidden="true">
            Status
          </span>
          <span>{label}</span>
          <ChevronDown className={styles.statusChevron} aria-hidden="true" />
        </button>
      )}
    >
      {statusItems}
    </Menu>
  );
}
