import { TERM_TEXT_MAX, type Term } from '@webnovel-hub/shared';
import { Trash2 } from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';
import { Button, ChoiceGroup, ChoiceLabel, Dialog, TextField } from '../../components/ui';
import styles from './Terms.module.css';
import { useDeleteTerm, useSaveTerm } from './termActions';

type Scope = 'novel' | 'all';

interface TermDialogProps {
  open: boolean;
  onClose: () => void;
  /** The term to change; null to add one. */
  term: Term | null;
  /** The novel a new term is for; null when there's none (it is then for every novel). */
  novel: { id: string; title: string } | null;
  /** The text a new term starts from, e.g. what was selected in the reader. */
  original?: string;
}

/**
 * Adds or changes a term: the text as the chapters have it, what to show instead, and
 * whether it is for this novel only or for every novel.
 */
export function TermDialog({ open, onClose, term, novel, original = '' }: TermDialogProps) {
  const formId = useId();
  const save = useSaveTerm(term);
  const remove = useDeleteTerm();
  // The novel the term can belong to: its own, or the one it is being added from.
  const termNovel = term ? term.novel : novel;
  const scopeNovel = termNovel ?? novel;
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [scope, setScope] = useState<Scope>('novel');
  const [problem, setProblem] = useState<string | null>(null);
  const busy = save.isPending || remove.isPending;

  // Opening the dialog starts from the term (or the selection) as it is now.
  const [shownFor, setShownFor] = useState(false);
  if (open !== shownFor) {
    setShownFor(open);
    if (open) {
      setFrom(term?.original ?? original);
      setTo(term?.replacement ?? '');
      setScope(termNovel ? 'novel' : 'all');
      setProblem(null);
      save.reset();
      remove.reset();
    }
  }

  const close = () => {
    if (!busy) onClose();
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (from.trim() === '') {
      setProblem('Enter the text to replace.');
      return;
    }
    setProblem(null);
    save.mutate(
      {
        novelId: scope === 'novel' && scopeNovel ? scopeNovel.id : null,
        original: from,
        replacement: to,
      },
      { onSuccess: onClose },
    );
  };

  const error = save.error ?? remove.error;
  return (
    <Dialog
      open={open}
      title={term ? 'Edit term' : 'Add term'}
      describe={false}
      busy={busy}
      onCancel={close}
      actions={
        <>
          {term && (
            <Button
              variant="danger"
              icon={<Trash2 aria-hidden="true" />}
              className={styles.deleteAction}
              busy={remove.isPending}
              disabled={save.isPending}
              onClick={() => remove.mutate(term, { onSuccess: onClose })}
            >
              Delete
            </Button>
          )}
          <Button onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            busy={save.isPending}
            disabled={remove.isPending}
          >
            Save
          </Button>
        </>
      }
    >
      <form id={formId} className={styles.form} onSubmit={onSubmit} noValidate>
        <TextField
          label="Text in the chapters"
          hint="Matches whole words, with the same capitals."
          value={from}
          maxLength={TERM_TEXT_MAX}
          error={problem ?? undefined}
          onChange={(event) => setFrom(event.target.value)}
        />
        <TextField
          label="Show instead"
          hint="Leave it empty to hide the text."
          value={to}
          maxLength={TERM_TEXT_MAX}
          data-autofocus
          onChange={(event) => setTo(event.target.value)}
        />
        {scopeNovel ? (
          <ChoiceGroup
            legend="Use it in"
            value={scope}
            options={[
              { value: 'novel', label: scopeNovel.title },
              { value: 'all', label: 'Every novel' },
            ]}
            onChange={setScope}
            layout="list"
            render={(option, detailId) => (
              <>
                <ChoiceLabel>{option.label}</ChoiceLabel>
                <span id={detailId} className={styles.choiceDetail}>
                  {option.value === 'novel' ? 'This novel only' : 'Unless a novel has its own'}
                </span>
              </>
            )}
          />
        ) : (
          <p className={styles.note}>This term is used in every novel.</p>
        )}
        {error && (
          <p className={styles.problem} role="alert">
            {error.message}
          </p>
        )}
      </form>
    </Dialog>
  );
}
