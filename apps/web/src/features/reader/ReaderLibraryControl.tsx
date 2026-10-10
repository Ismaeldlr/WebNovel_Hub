import type { LibraryState, ReaderNovel } from '@webnovel-hub/shared';
import { ChevronDown } from 'lucide-react';
import { Menu, MenuHeader, MenuItem } from '../../components/ui';
import { STATUS_LABELS, STATUS_OPTIONS } from '../../lib/reading';
import { useSetStatus } from '../library/libraryActions';
import styles from './ReaderPage.module.css';

interface Props {
  novel: ReaderNovel;
  library: LibraryState | null;
}

/** The status panel inside the reader. */
export function ReaderLibraryControl({ novel, library }: Props) {
  const setStatus = useSetStatus();
  if (!library) return null;

  const label = STATUS_LABELS[library.status];
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
    </Menu>
  );
}
