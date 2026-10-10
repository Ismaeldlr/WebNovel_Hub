import type { ImportConflict } from '@webnovel-hub/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { BookOpen, BookPlus, CircleCheck, Info, Link2 } from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';
import { useSearchParams } from 'react-router';
import { getSources, importsApi } from '../../api/catalog';
import { ApiError } from '../../api/client';
import { queryKeys } from '../../app/queryClient';
import { Badge, Button, ButtonLink, Tabs, tabPanelProps } from '../../components/ui';
import { PageHeader } from '../pages/PageHeader';
import styles from './AddNovelsPage.module.css';
import { EpubImport } from './EpubImport';
import { ImportJob } from './ImportJob';
import { RecentImports } from './RecentImports';
import { SupportedSites } from './SupportedSites';
import { checkUrl } from './urlCheck';
import { useWtrLabNotice } from './wtrLabNotice';

type Method = 'url' | 'epub';

/** Add Novels: import by URL or from an EPUB file. */
export function AddNovelsPage() {
  const [params, setParams] = useSearchParams();
  const method: Method = params.get('from') === 'epub' ? 'epub' : 'url';

  return (
    <>
      <PageHeader
        title="Add Novels"
        lead="Paste the address of a novel from a supported site, or upload an EPUB, and it joins your library."
      />
      <div className={styles.layout}>
        <Tabs
          label="How to add a novel"
          idPrefix="add"
          tabs={[
            { id: 'url', label: 'From a link' },
            { id: 'epub', label: 'From an EPUB file' },
          ]}
          selected={method}
          onSelect={(next) => setParams(next === 'epub' ? { from: 'epub' } : {}, { replace: true })}
        />
        <div {...tabPanelProps('add', method)} className={styles.panel}>
          {method === 'url' ? <UrlImport /> : <EpubImport />}
        </div>
        <RecentImports />
      </div>
    </>
  );
}

function UrlImport() {
  const [params, setParams] = useSearchParams();
  const jobId = params.get('job');
  const sources = useQuery({
    queryKey: queryKeys.sources,
    queryFn: ({ signal }) => getSources(signal),
  });
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const [conflict, setConflict] = useState<ImportConflict | null>(null);
  const inputId = useId();

  const submit = useMutation({
    mutationFn: importsApi.importUrl,
    // The job id goes in the address, so a reload keeps following it.
    onSuccess: (id) => setParams({ job: id }, { replace: true }),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409)
        setConflict(error.data as ImportConflict);
    },
  });

  const check = checkUrl(value, sources.data);
  useWtrLabNotice(check.kind === 'ready' ? check.source?.key : undefined);
  const showProblem = touched && (check.kind === 'invalid' || check.kind === 'unsupported');
  const serverError =
    submit.error && !(submit.error instanceof ApiError && submit.error.status === 409)
      ? submit.error.message
      : null;

  const start = (url: string) => {
    setConflict(null);
    submit.reset();
    submit.mutate(url);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (check.kind === 'ready') start(check.url);
  };

  const reset = () => {
    setParams({}, { replace: true });
    setValue('');
    setTouched(false);
    setConflict(null);
    submit.reset();
  };

  if (jobId) return <ImportJob jobId={jobId} onRetry={start} onDone={reset} />;

  const describedBy = [`${inputId}-help`, showProblem || serverError ? `${inputId}-problem` : null]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <label htmlFor={inputId} className={styles.label}>
          Novel address
        </label>
        <div className={styles.inputRow}>
          <div className={styles.inputWrap} data-invalid={showProblem || undefined}>
            <Link2 className={styles.inputIcon} aria-hidden="true" />
            <input
              id={inputId}
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              className={styles.input}
              placeholder="https://www.royalroad.com/fiction/…"
              value={value}
              aria-invalid={showProblem || undefined}
              aria-describedby={describedBy}
              onChange={(event) => {
                setValue(event.target.value);
                setConflict(null);
                if (submit.isError) submit.reset();
              }}
              onBlur={() => setTouched(value.trim() !== '')}
            />
            {check.kind === 'ready' && check.source && (
              <span className={styles.detected} aria-live="polite">
                <Badge tone="ok" icon={<CircleCheck aria-hidden="true" />}>
                  {check.source.name}
                </Badge>
              </span>
            )}
          </div>
          <Button
            type="submit"
            variant="primary"
            icon={<BookPlus aria-hidden="true" />}
            busy={submit.isPending}
          >
            Import
          </Button>
        </div>

        <p id={`${inputId}-help`} className={styles.help}>
          Paste the novel's page, or any of its chapters
          {sources.data ? ', from one of the supported sites listed below.' : '.'}
        </p>

        {(showProblem || serverError) && (
          <p id={`${inputId}-problem`} className={styles.problem} role="alert">
            {serverError ??
              (check.kind === 'invalid' || check.kind === 'unsupported' ? check.message : '')}
          </p>
        )}

        {conflict && <ConflictNotice conflict={conflict} />}

        {sources.isError && (
          <p className={styles.help}>
            <Info aria-hidden="true" className={styles.inlineIcon} /> The list of supported sites
            didn't load, so the address will be checked when you import it.
          </p>
        )}
      </form>
      {sources.data && <SupportedSites sources={sources.data} />}
    </>
  );
}

/** This exact address is already in the library. */
function ConflictNotice({ conflict }: { conflict: ImportConflict }) {
  return (
    <div className={styles.conflict} role="status">
      <p>
        <strong>“{conflict.title}” is already in your library.</strong>
      </p>
      <div className={styles.jobActions}>
        <ButtonLink to={`/novels/${conflict.novelId}`} icon={<BookOpen aria-hidden="true" />}>
          Open
        </ButtonLink>
      </div>
    </div>
  );
}
