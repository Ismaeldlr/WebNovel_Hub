import { FileDown } from 'lucide-react';
import { Button, type ButtonProps } from '../../components/ui';
import { type ExportEpubOptions, useExportEpub } from './useExportEpub';

interface ExportButtonProps extends ExportEpubOptions {
  variant?: ButtonProps['variant'];
}

/**
 * Downloads the novel's stored chapters as an EPUB file, hidden until one is
 * stored. Chapters not stored yet are left out; the toast says so.
 */
export function ExportButton({
  novel,
  storedChapters,
  totalChapters,
  variant = 'ghost',
}: ExportButtonProps) {
  const exportEpub = useExportEpub({ novel, storedChapters, totalChapters });
  if (storedChapters === 0) return null;
  return (
    <Button
      variant={variant}
      icon={<FileDown aria-hidden="true" />}
      busy={exportEpub.isPending}
      onClick={() => exportEpub.mutate()}
      aria-label={`Export EPUB of ${novel.title}`}
    >
      Export EPUB
    </Button>
  );
}
