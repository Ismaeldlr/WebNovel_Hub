import { useMutation, useQuery } from '@tanstack/react-query';
import { backupFileName, type LibrarySummary } from '@webnovel-hub/core';
import { ArchiveRestore, FileDown, FolderOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Card, ConfirmDialog, Notice, useToast } from '../../components/ui';
import { formatDate, plural } from '../../lib/format';
import { getCore } from '../../app/core';
import { type AppKind, type BackupShell, type KeptBackup, getPlatform } from '../../platform';
import { SectionHeading } from './SectionHeading';
import styles from './SettingsPage.module.css';

/** Where the page leaves how a restore went, to say so once it has reloaded. */
const RESTORE_RESULT = 'webnovel-hub-restore';

interface RestoreResult {
  ok: boolean;
  message: string;
}

function takeRestoreResult(): RestoreResult | null {
  try {
    const saved = sessionStorage.getItem(RESTORE_RESULT);
    sessionStorage.removeItem(RESTORE_RESULT);
    return saved ? (JSON.parse(saved) as RestoreResult) : null;
  } catch {
    return null;
  }
}

/** Read when the page loads: shown the first time Settings opens after a restore. */
let lastRestore = takeRestoreResult();

async function shell(): Promise<BackupShell> {
  const backups = (await getPlatform()).backups;
  if (!backups) throw new Error('Backups need the Windows or Android app.');
  return backups;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** `webnovel-hub-before-restore-2026-10-11-223015.whub`, from the local time. */
function keptName(now = new Date()): string {
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `webnovel-hub-before-restore-${day}-${time}.whub`;
}

/** When a kept library was replaced, from its name. */
function keptAt(backup: KeptBackup): string {
  const match = /(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(backup.name);
  if (!match) return backup.name;
  const [year = 0, month = 1, day, hours, minutes] = match.slice(1).map(Number);
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(year, month - 1, day, hours, minutes),
  );
}

const contents = (library: LibrarySummary) =>
  `${plural(library.novels, 'novel')} and ${plural(library.chapters, 'saved chapter')}`;

interface Candidate {
  path: string;
  backup: LibrarySummary;
  current: LibrarySummary;
}

/** Saves the library to a file, and puts a saved library (or a replaced one) back. */
export function BackupSection({ kind }: { kind: Exclude<AppKind, 'browser'> }) {
  const toast = useToast();
  const [restored] = useState(lastRestore);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  useEffect(() => {
    lastRestore = null;
  }, []);

  const kept = useQuery({
    queryKey: ['kept-backups'],
    queryFn: async () => (await shell()).kept(),
  });

  const save = useMutation({
    mutationFn: async () => {
      const backups = await shell();
      const name = backupFileName();
      const path = await backups.tempPath(name);
      await (await getCore()).backups.write(path);
      return { name, saved: await backups.save(path, name) };
    },
    onSuccess: ({ name, saved }) => {
      if (saved) toast({ title: `Saved ${name}`, tone: 'success' });
    },
    onError: (error) =>
      toast({ title: "Couldn't back up the library", description: error.message, tone: 'error' }),
  });

  const inspect = useMutation({
    mutationFn: async (path: string | null) => {
      path ??= await (await shell()).pick();
      if (!path) return null;
      const core = await getCore();
      return {
        path,
        backup: await core.backups.inspect(path),
        current: await core.backups.summary(),
      };
    },
    onSuccess: (found) => setCandidate(found),
    onError: (error) =>
      toast({ title: "Couldn't restore that file", description: error.message, tone: 'error' }),
  });

  const restore = useMutation({
    mutationFn: async (chosen: Candidate) => {
      const backups = await shell();
      await (await getCore()).release();
      let result: RestoreResult;
      try {
        await backups.replaceLibrary(chosen.path, keptName());
        result = { ok: true, message: `Your library now holds ${contents(chosen.backup)}.` };
      } catch (error) {
        result = { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
      try {
        sessionStorage.setItem(RESTORE_RESULT, JSON.stringify(result));
      } catch {
        // The reloaded page just won't say how it went.
      }
      // The core opens the library again (and brings an older backup up to date).
      window.location.reload();
    },
  });

  return (
    <Card as="section" aria-labelledby="settings-backup" className={styles.section}>
      <SectionHeading id="settings-backup" title="Backup">
        {kind === 'android'
          ? 'Save your library (novels, saved chapters, progress and settings) to one file, through the share sheet: to Files, Drive or your computer. Restoring a file replaces the library on this phone, in this app or the Windows one.'
          : 'Save your library (novels, saved chapters, progress and settings) to one file. Restoring a file replaces the library on this computer, in this app or the Android one.'}
      </SectionHeading>
      {restored && (
        <Notice variant="inline" tone={restored.ok ? 'ok' : 'danger'} role="status">
          {restored.ok
            ? `Restored. ${restored.message}`
            : `The restore didn't go through: ${restored.message} Your library is as it was.`}
        </Notice>
      )}
      <div className={styles.actions}>
        <Button
          variant="primary"
          icon={<FileDown aria-hidden="true" />}
          busy={save.isPending}
          onClick={() => save.mutate()}
        >
          Back up library
        </Button>
        <Button
          icon={<FolderOpen aria-hidden="true" />}
          busy={inspect.isPending && inspect.variables === null}
          onClick={() => inspect.mutate(null)}
        >
          Restore from a file
        </Button>
      </div>
      {kept.data && kept.data.length > 0 && (
        <div className={styles.kept}>
          <h3 className={styles.keptTitle}>Replaced by a restore</h3>
          <ul className={styles.keptList}>
            {kept.data.map((backup) => (
              <li key={backup.path}>
                <span>The library as it was on {keptAt(backup)}</span>
                <Button
                  variant="ghost"
                  icon={<ArchiveRestore aria-hidden="true" />}
                  busy={inspect.isPending && inspect.variables === backup.path}
                  onClick={() => inspect.mutate(backup.path)}
                >
                  Put back
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ConfirmDialog
        open={candidate !== null}
        title="Replace your library?"
        confirmLabel="Replace library"
        tone="danger"
        busy={restore.isPending}
        onConfirm={() => candidate && restore.mutate(candidate)}
        onCancel={() => setCandidate(null)}
      >
        {candidate && (
          <p>
            The backup holds {contents(candidate.backup)}
            {candidate.backup.lastChange &&
              `, last changed ${formatDate(candidate.backup.lastChange)}`}
            . It takes the place of your library, which holds {contents(candidate.current)}; that
            one is kept on this {kind === 'android' ? 'phone' : 'computer'}, and you can put it back
            from here.
          </p>
        )}
      </ConfirmDialog>
    </Card>
  );
}
