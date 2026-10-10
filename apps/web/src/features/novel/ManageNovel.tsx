import { NOVEL_DETAIL_LIMITS, type NovelDetail } from '@webnovel-hub/shared';
import { ImageUp, PencilLine, Trash2 } from 'lucide-react';
import { type FormEvent, useId, useRef, useState } from 'react';
import { Button, ConfirmDialog, Dialog, TextArea, TextField, useToast } from '../../components/ui';
import { plural } from '../../lib/format';
import { checkCoverFile, useDeleteNovel, useUpdateDetails, useUploadCover } from './manageActions';
import styles from './NovelPage.module.css';

/** Tags as the reader types them: separated by commas. */
const parseTags = (text: string) =>
  text
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

/** "Edit details" and "Change cover". Only the novel's own details: chapter text can't be edited. */
export function ManageButtons({ novel }: { novel: NovelDetail }) {
  const [editing, setEditing] = useState(false);
  const cover = useUploadCover(novel.id);
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <Button
        variant="ghost"
        icon={<PencilLine aria-hidden="true" />}
        onClick={() => setEditing(true)}
      >
        Edit details
      </Button>
      <Button
        variant="ghost"
        icon={<ImageUp aria-hidden="true" />}
        busy={cover.isPending}
        onClick={() => inputRef.current?.click()}
      >
        Change cover
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="cover-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          const problem = checkCoverFile(file);
          if (problem)
            toast({ title: "Couldn't change the cover", description: problem, tone: 'error' });
          else cover.mutate(file);
        }}
      />
      <EditDetailsDialog novel={novel} open={editing} onClose={() => setEditing(false)} />
    </>
  );
}

function EditDetailsDialog({
  novel,
  open,
  onClose,
}: {
  novel: NovelDetail;
  open: boolean;
  onClose: () => void;
}) {
  const formId = useId();
  const save = useUpdateDetails(novel.id);
  const [title, setTitle] = useState(novel.title);
  const [author, setAuthor] = useState(novel.author ?? '');
  const [description, setDescription] = useState(novel.description ?? '');
  const [tags, setTags] = useState(novel.tags.join(', '));
  const [titleProblem, setTitleProblem] = useState<string | null>(null);

  const close = () => {
    save.reset();
    setTitleProblem(null);
    onClose();
  };
  // Opening the dialog starts from the novel as it is now.
  const [shownFor, setShownFor] = useState(open);
  if (open !== shownFor) {
    setShownFor(open);
    if (open) {
      setTitle(novel.title);
      setAuthor(novel.author ?? '');
      setDescription(novel.description ?? '');
      setTags(novel.tags.join(', '));
    }
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (title.trim() === '') {
      setTitleProblem('Enter a title.');
      return;
    }
    setTitleProblem(null);
    save.mutate(
      { title, author, description, tags: parseTags(tags) },
      { onSuccess: () => onClose() },
    );
  };

  return (
    <Dialog
      open={open}
      title="Edit details"
      size="lg"
      describe={false}
      busy={save.isPending}
      onCancel={close}
      actions={
        <>
          <Button onClick={close} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" busy={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id={formId} className={styles.detailsForm} onSubmit={onSubmit} noValidate>
        <p className={styles.formNote}>Chapters and their text stay as the source has them.</p>
        <TextField
          label="Title"
          value={title}
          maxLength={NOVEL_DETAIL_LIMITS.title}
          error={titleProblem ?? undefined}
          onChange={(event) => setTitle(event.target.value)}
        />
        <TextField
          label="Author"
          value={author}
          maxLength={NOVEL_DETAIL_LIMITS.author}
          onChange={(event) => setAuthor(event.target.value)}
        />
        <TextArea
          label="Description"
          value={description}
          rows={8}
          maxLength={NOVEL_DETAIL_LIMITS.description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <TextField
          label="Tags"
          hint="Separate tags with commas."
          value={tags}
          onChange={(event) => setTags(event.target.value)}
        />
        {save.error && (
          <p className={styles.formProblem} role="alert">
            {save.error.message}
          </p>
        )}
      </form>
    </Dialog>
  );
}

/** "Delete": the novel and everything stored for it, after a confirmation. */
export function DeleteNovel({ novel }: { novel: NovelDetail }) {
  const [open, setOpen] = useState(false);
  const destroy = useDeleteNovel(novel.id, novel.title);
  return (
    <>
      <Button variant="ghost" icon={<Trash2 aria-hidden="true" />} onClick={() => setOpen(true)}>
        Delete
      </Button>
      <ConfirmDialog
        open={open}
        title={`Delete “${novel.title}”?`}
        confirmLabel="Delete"
        tone="danger"
        busy={destroy.isPending}
        onCancel={() => setOpen(false)}
        onConfirm={() => destroy.mutate(undefined, { onSettled: () => setOpen(false) })}
      >
        <p>
          Its {plural(novel.totalChapters, 'chapter')} and their stored text, its cover and your
          reading history of it are deleted from this device. It can't be undone.
        </p>
      </ConfirmDialog>
    </>
  );
}
