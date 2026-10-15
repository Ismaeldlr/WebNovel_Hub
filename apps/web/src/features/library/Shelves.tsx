import { HIDDEN_SHELF, SHELF_LIMITS, type Shelf } from '@webnovel-hub/shared';
import { ArrowDown, ArrowUp, Check, Plus, Settings2, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Button, Dialog, IconButton, Tabs, TextField } from '../../components/ui';
import { plural } from '../../lib/format';
import { useSetShelves } from './libraryActions';
import { useShelfChanges, useShelves } from './shelfActions';
import styles from './Shelves.module.css';

/** The tab list's id prefix; the library's list is its panel. */
export const SHELF_TABS = 'library-shelf';

/**
 * The shelves as tabs over the library (Mihon's categories): All, each shelf, and Hidden
 * once a novel is hidden; then a button to edit them. Shown once there is a shelf or a
 * hidden novel.
 */
export function ShelfTabs({
  shelves,
  total,
  hidden,
  selected,
  onSelect,
  onEdit,
}: {
  shelves: Shelf[];
  /** The library's novels, hidden ones left out. */
  total: number;
  hidden: number;
  selected: string | null;
  onSelect: (shelf: string | null) => void;
  onEdit: () => void;
}) {
  const showHidden = hidden > 0 || selected === HIDDEN_SHELF;
  if (shelves.length === 0 && !showHidden) return null;
  const tabs = [
    { id: 'all', label: 'All', count: total },
    ...shelves.map((shelf) => ({ id: shelf.id, label: shelf.name, count: shelf.novels })),
    ...(showHidden ? [{ id: HIDDEN_SHELF, label: 'Hidden', count: hidden }] : []),
  ];
  return (
    <div className={styles.tabs}>
      <Tabs
        label="Shelves"
        idPrefix={SHELF_TABS}
        look="line"
        tabs={tabs}
        selected={selected ?? 'all'}
        onSelect={(id) => onSelect(id === 'all' ? null : id)}
      />
      <IconButton size="sm" label="Edit shelves" onClick={onEdit}>
        <Settings2 aria-hidden="true" />
      </IconButton>
    </div>
  );
}

/** A shelf's name as typed: trimmed; null when empty or too long, with why. */
function shelfName(text: string): { name: string; problem: null } | { problem: string } {
  const name = text.trim();
  if (!name) return { problem: 'Give the shelf a name.' };
  if (name.length > SHELF_LIMITS.name) {
    return { problem: `A shelf's name can be up to ${SHELF_LIMITS.name} characters.` };
  }
  return { name, problem: null };
}

/** "New shelf": a name and a button; `onCreated` gets the new shelf. */
function NewShelf({ onCreated }: { onCreated?: (shelf: Shelf) => void }) {
  const { create } = useShelfChanges();
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const checked = shelfName(text);
    if (checked.problem !== null) {
      setProblem(checked.problem);
      return;
    }
    create.mutate(checked.name, {
      onSuccess: (shelf) => {
        setText('');
        setProblem(null);
        onCreated?.(shelf);
      },
      onError: (error) => setProblem(error.message),
    });
  };
  return (
    <form className={styles.newShelf} onSubmit={submit} noValidate>
      <TextField
        label="New shelf"
        hint="Any name, emojis too."
        value={text}
        maxLength={SHELF_LIMITS.name}
        onChange={(event) => setText(event.target.value)}
        {...(problem ? { error: problem } : {})}
      />
      <Button type="submit" icon={<Plus aria-hidden="true" />} busy={create.isPending}>
        Add
      </Button>
    </form>
  );
}

/** Renames, moves and deletes the shelves, and makes new ones. */
export function EditShelvesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const shelves = useShelves().data ?? [];
  const { reorder } = useShelfChanges();
  const move = (index: number, by: -1 | 1) => {
    const ids = shelves.map((shelf) => shelf.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + by, 0, moved!);
    reorder.mutate(ids);
  };
  return (
    <Dialog
      open={open}
      title="Shelves"
      placement="sheet"
      describe={false}
      onCancel={onClose}
      actions={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <p className={styles.lead}>
        Your own lists of novels, besides their status. A novel can be on any number of them.
      </p>
      {shelves.length > 0 && (
        <ul className={styles.editList}>
          {shelves.map((shelf, index) => (
            <EditShelfRow
              key={shelf.id}
              shelf={shelf}
              first={index === 0}
              last={index === shelves.length - 1}
              onMove={(by) => move(index, by)}
            />
          ))}
        </ul>
      )}
      <NewShelf />
    </Dialog>
  );
}

function EditShelfRow({
  shelf,
  first,
  last,
  onMove,
}: {
  shelf: Shelf;
  first: boolean;
  last: boolean;
  onMove: (by: -1 | 1) => void;
}) {
  const { rename, remove } = useShelfChanges();
  const [text, setText] = useState(shelf.name);
  const [problem, setProblem] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const save = () => {
    const checked = shelfName(text);
    if (checked.problem !== null) {
      setProblem(checked.problem);
      return;
    }
    if (checked.name === shelf.name) {
      setProblem(null);
      return;
    }
    rename.mutate(
      { id: shelf.id, name: checked.name },
      { onSuccess: () => setProblem(null), onError: (error) => setProblem(error.message) },
    );
  };

  if (deleting) {
    return (
      <li className={styles.editRow} data-deleting>
        <p className={styles.confirm}>
          Delete “{shelf.name}”? Its {plural(shelf.novels, 'novel')} stay in your library.
        </p>
        <div className={styles.rowActions}>
          <Button size="sm" onClick={() => setDeleting(false)}>
            Keep
          </Button>
          <Button
            size="sm"
            variant="danger"
            busy={remove.isPending}
            onClick={() => remove.mutate(shelf)}
          >
            Delete
          </Button>
        </div>
      </li>
    );
  }
  return (
    <li className={styles.editRow}>
      <form
        className={styles.rename}
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        noValidate
      >
        <TextField
          label={`Name of “${shelf.name}”`}
          hideLabel
          value={text}
          maxLength={SHELF_LIMITS.name}
          onChange={(event) => setText(event.target.value)}
          onBlur={save}
          {...(problem ? { error: problem } : {})}
        />
      </form>
      <span className={styles.count}>{plural(shelf.novels, 'novel')}</span>
      <div className={styles.rowActions}>
        <IconButton
          size="sm"
          label={`Move “${shelf.name}” up`}
          disabled={first}
          onClick={() => onMove(-1)}
        >
          <ArrowUp aria-hidden="true" />
        </IconButton>
        <IconButton
          size="sm"
          label={`Move “${shelf.name}” down`}
          disabled={last}
          onClick={() => onMove(1)}
        >
          <ArrowDown aria-hidden="true" />
        </IconButton>
        <IconButton size="sm" label={`Delete “${shelf.name}”`} onClick={() => setDeleting(true)}>
          <Trash2 aria-hidden="true" />
        </IconButton>
      </div>
    </li>
  );
}

/**
 * The shelves a novel is on, as checkboxes that apply as they change, and a new shelf
 * that the novel goes straight onto.
 */
export function NovelShelvesDialog({
  novelId,
  title,
  shelfIds,
  open,
  onClose,
}: {
  novelId: string;
  title: string;
  shelfIds: string[];
  open: boolean;
  onClose: () => void;
}) {
  const shelves = useShelves();
  const setShelves = useSetShelves();
  const put = (ids: string[]) => setShelves.mutate({ novelId, shelfIds: ids });
  const toggle = (id: string, on: boolean) =>
    put(on ? [...shelfIds, id] : shelfIds.filter((each) => each !== id));
  return (
    <Dialog
      open={open}
      title="Shelves"
      placement="sheet"
      describe={false}
      onCancel={onClose}
      actions={
        <Button variant="primary" icon={<Check aria-hidden="true" />} onClick={onClose}>
          Done
        </Button>
      }
    >
      <fieldset className={styles.pick}>
        <legend className={styles.lead}>The shelves {title} is on</legend>
        {shelves.data && shelves.data.length === 0 && (
          <p className={styles.empty}>No shelves yet: make one below.</p>
        )}
        {shelves.data?.map((shelf) => (
          <label key={shelf.id} className={styles.pickRow}>
            <input
              type="checkbox"
              checked={shelfIds.includes(shelf.id)}
              onChange={(event) => toggle(shelf.id, event.target.checked)}
            />
            <span className={styles.pickName}>{shelf.name}</span>
            <span className={styles.count}>{shelf.novels.toLocaleString()}</span>
          </label>
        ))}
      </fieldset>
      <NewShelf onCreated={(shelf) => put([...shelfIds, shelf.id])} />
    </Dialog>
  );
}
