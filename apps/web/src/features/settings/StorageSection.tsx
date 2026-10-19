import type { NovelStorage } from '@webnovel-hub/shared';
import { FileX2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button, Card, ConfirmDialog, ErrorState, Spinner } from '../../components/ui';
import { formatBytes, plural } from '../../lib/format';
import { useClearDownloads, useStorage } from '../novel/manageActions';
import { SectionHeading } from './SectionHeading';
import styles from './SettingsPage.module.css';

/**
 * Storage: how much chapter text each novel keeps on the device, largest first, and a way
 * to delete a novel's downloaded chapters while keeping the novel and the progress in it.
 */
export function StorageSection() {
  const storage = useStorage();
  const clear = useClearDownloads();
  const [clearing, setClearing] = useState<NovelStorage | null>(null);

  return (
    <Card as="section" aria-labelledby="settings-storage" className={styles.section}>
      <SectionHeading id="settings-storage" title="Downloaded chapters">
        {storage.data
          ? `${formatBytes(storage.data.totalBytes)} of chapter text on this device.`
          : 'The chapter text saved on this device, by novel.'}{' '}
        Deleting a novel&apos;s downloads keeps the novel and your progress; chapters download again
        as you read them.
      </SectionHeading>
      {storage.isPending ? (
        <Spinner label="Adding up your downloads" />
      ) : storage.isError ? (
        <ErrorState
          title="Storage didn't load"
          message={storage.error.message}
          onRetry={() => void storage.refetch()}
          retrying={storage.isFetching}
        />
      ) : storage.data.novels.length === 0 ? (
        <p className={styles.storageEmpty}>No chapters are downloaded yet.</p>
      ) : (
        <ul className={styles.storageList}>
          {storage.data.novels.map((novel) => (
            <li key={novel.novelId} className={styles.storageRow}>
              <span className={styles.storageText}>
                <Link to={`/novels/${novel.novelId}`} className={styles.storageTitle}>
                  {novel.title}
                </Link>
                <span className={styles.storageDetail}>
                  {plural(novel.storedChapters, 'chapter')} · {formatBytes(novel.bytes)}
                  {novel.canClear ? '' : ' · from an EPUB file'}
                </span>
              </span>
              {novel.canClear && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<FileX2 aria-hidden="true" />}
                  aria-label={`Delete the downloaded chapters of ${novel.title}`}
                  onClick={() => setClearing(novel)}
                >
                  Delete
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={clearing !== null}
        title="Delete the downloaded chapters?"
        confirmLabel="Delete downloads"
        tone="danger"
        busy={clear.isPending}
        onCancel={() => setClearing(null)}
        onConfirm={() => {
          if (!clearing) return;
          clear.mutate(
            { novelId: clearing.novelId, title: clearing.title },
            { onSettled: () => setClearing(null) },
          );
        }}
      >
        <p>
          The text of {plural(clearing?.storedChapters ?? 0, 'downloaded chapter')} (
          {formatBytes(clearing?.bytes ?? 0)}) is deleted from this device. “{clearing?.title}”
          stays in your library with its chapter list and your progress.
        </p>
      </ConfirmDialog>
    </Card>
  );
}
