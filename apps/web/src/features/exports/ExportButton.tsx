import { type NovelSummary, epubFileName } from '@webnovel-hub/shared';
import { useMutation } from '@tanstack/react-query';
import { FileDown } from 'lucide-react';
import { exportApi } from '../../api/catalog';
import { Button, type ButtonProps, useToast } from '../../components/ui';
import { saveFile } from '../../lib/download';

interface ExportButtonProps {
  novel: Pick<NovelSummary, 'id' | 'title'>;
  storedChapters: number;
  totalChapters: number;
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
  const toast = useToast();
  const exportEpub = useMutation({
    mutationFn: async () => {
      const fileName = epubFileName(novel.title);
      const saved = await saveFile(await exportApi.epub(novel.id), fileName);
      return { fileName, saved };
    },
    onSuccess: ({ fileName, saved }) => {
      if (!saved) return;
      toast({
        title: `Exported ${fileName}`,
        description:
          storedChapters < totalChapters
            ? `It holds the ${storedChapters.toLocaleString()} of ${totalChapters.toLocaleString()} chapters stored so far.`
            : undefined,
        tone: 'success',
      });
    },
    onError: (error) =>
      toast({ title: "Couldn't export the EPUB", description: error.message, tone: 'error' }),
  });

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
