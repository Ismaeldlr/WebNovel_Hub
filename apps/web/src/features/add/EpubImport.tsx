import type { ImportConflict, ImportEpubResponse } from '@webnovel-hub/shared';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, CircleCheck, FileText, FileUp, Upload } from 'lucide-react';
import { type DragEvent, useEffect, useId, useRef, useState } from 'react';
import { importsApi } from '../../api/catalog';
import { ApiError } from '../../api/client';
import { queryKeys } from '../../app/queryClient';
import { Cover } from '../../components/Cover';
import { Button, ButtonLink, ProgressBar } from '../../components/ui';
import { formatBytes, plural } from '../../lib/format';
import styles from './AddNovelsPage.module.css';
import { EPUB_CHECKS, checkEpubFile } from './epubCheck';

type UploadState =
  | { phase: 'idle' }
  | { phase: 'reading' }
  | { phase: 'done'; result: ImportEpubResponse }
  | { phase: 'conflict'; conflict: ImportConflict };

/**
 * The EPUB tab of Add Novels: drag and drop or the file picker, the quick checks first,
 * then a summary with "View novel".
 */
export function EpubImport() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadState>({ phase: 'idle' });
  const [dragging, setDragging] = useState(false);
  const id = useId();

  // Leaving the page drops the result of an import in progress.
  useEffect(() => () => abortRef.current?.abort(), []);

  const choose = (files: FileList | null) => {
    const [first] = files ?? [];
    if (!first) return;
    setUpload({ phase: 'idle' });
    if (files && files.length > 1) {
      setFile(null);
      setProblem(EPUB_CHECKS.oneFile);
      return;
    }
    const check = checkEpubFile(first);
    setFile(check ? null : first);
    setProblem(check);
  };

  const start = async () => {
    if (!file || upload.phase === 'reading') return;
    const controller = new AbortController();
    abortRef.current = controller;
    setProblem(null);
    setUpload({ phase: 'reading' });
    try {
      const result = await importsApi.importEpub(file, { signal: controller.signal });
      setUpload({ phase: 'done', result });
      // A new novel in the library and the search.
      void queryClient.invalidateQueries({ queryKey: queryKeys.library });
      void queryClient.invalidateQueries({ queryKey: queryKeys.searches });
    } catch (error) {
      if (controller.signal.aborted) {
        setUpload({ phase: 'idle' });
      } else if (error instanceof ApiError && error.status === 409 && error.data) {
        setUpload({ phase: 'conflict', conflict: error.data as ImportConflict });
      } else {
        setUpload({ phase: 'idle' });
        setProblem(error instanceof Error ? error.message : String(error));
      }
    } finally {
      abortRef.current = null;
    }
  };

  const reset = () => {
    setFile(null);
    setProblem(null);
    setUpload({ phase: 'idle' });
    if (inputRef.current) inputRef.current.value = '';
  };

  if (upload.phase === 'done') return <ImportSummary result={upload.result} onDone={reset} />;

  const onDragOver = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragging(true);
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (upload.phase !== 'reading') choose(event.dataTransfer.files);
  };

  const reading = upload.phase === 'reading';
  const describedBy = [`${id}-help`, problem ? `${id}-problem` : null].filter(Boolean).join(' ');

  return (
    <div className={styles.form}>
      <h2 className={styles.label} id={`${id}-title`}>
        EPUB file
      </h2>
      <div
        className={styles.dropZone}
        data-dragging={dragging || undefined}
        onDragEnter={onDragOver}
        onDragOver={onDragOver}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <FileUp className={styles.dropIcon} aria-hidden="true" />
        <p className={styles.dropText}>
          {dragging ? 'Drop it to choose this file' : 'Drag an EPUB file here, or'}
        </p>
        <input
          ref={inputRef}
          id={`${id}-input`}
          type="file"
          accept=".epub,application/epub+zip"
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => choose(event.target.files)}
        />
        <Button
          icon={<FileText aria-hidden="true" />}
          aria-describedby={describedBy}
          disabled={reading}
          onClick={() => inputRef.current?.click()}
        >
          {file ? 'Choose another file' : 'Choose a file'}
        </Button>
      </div>
      <p id={`${id}-help`} className={styles.help}>
        EPUB files up to 50 MB. The title, author, cover and chapters come from the file.
      </p>

      {file && (
        <div className={styles.fileRow} aria-busy={reading || undefined}>
          <FileText className={styles.fileIcon} aria-hidden="true" />
          <div className={styles.fileMain}>
            <p className={styles.fileName}>{file.name}</p>
            <p className={styles.fileMeta}>{formatBytes(file.size)}</p>
            {reading && (
              <>
                <ProgressBar
                  label="Import progress"
                  value={null}
                  valueText="Reading the EPUB"
                  size="sm"
                />
                <p className={styles.fileMeta} role="status">
                  Reading the EPUB…
                </p>
              </>
            )}
          </div>
          <Button
            variant="primary"
            icon={<Upload aria-hidden="true" />}
            busy={reading}
            onClick={() => void start()}
          >
            Import
          </Button>
        </div>
      )}

      {problem && (
        <p id={`${id}-problem`} className={styles.problem} role="alert">
          {problem}
        </p>
      )}

      {upload.phase === 'conflict' && (
        <div className={styles.conflict} role="status">
          <p>
            <strong>“{upload.conflict.title}” is already in your library.</strong> This exact file
            was imported before, so nothing was added twice.
          </p>
          <div className={styles.jobActions}>
            <ButtonLink
              to={`/novels/${upload.conflict.novelId}`}
              icon={<BookOpen aria-hidden="true" />}
            >
              Open
            </ButtonLink>
          </div>
        </div>
      )}
    </div>
  );
}

/** The success summary: what was imported, and "View novel". */
function ImportSummary({ result, onDone }: { result: ImportEpubResponse; onDone: () => void }) {
  const { novel, wordCount, duplicate } = result;
  return (
    <div className={styles.jobCard} data-tone="success" role="status">
      <CircleCheck className={styles.jobIcon} aria-hidden="true" />
      <div className={styles.jobBody}>
        <h3 className={styles.jobTitle}>
          {duplicate ? `“${novel.title}” is in your library` : `Imported “${novel.title}”`}
        </h3>
        <div className={styles.summary}>
          <Cover
            title={novel.title}
            author={novel.author}
            coverUrl={novel.coverUrl}
            size="sm"
            eager
          />
          <dl className={styles.summaryFacts}>
            <div>
              <dt>Author</dt>
              <dd>{novel.author ?? 'Unknown'}</dd>
            </div>
            <div>
              <dt>Chapters</dt>
              <dd>{novel.totalChapters.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Words</dt>
              <dd>{wordCount.toLocaleString()}</dd>
            </div>
          </dl>
        </div>
        <p className={styles.jobText}>
          {duplicate
            ? 'Someone had already imported this exact file, so it was added to your library as it is.'
            : `${plural(novel.totalChapters, 'chapter')} stored and ready to read.`}
        </p>
        <div className={styles.jobActions}>
          <ButtonLink
            to={`/novels/${novel.id}`}
            variant="primary"
            icon={<BookOpen aria-hidden="true" />}
          >
            View novel
          </ButtonLink>
          <Button variant="ghost" onClick={onDone}>
            Import another
          </Button>
        </div>
      </div>
    </div>
  );
}
