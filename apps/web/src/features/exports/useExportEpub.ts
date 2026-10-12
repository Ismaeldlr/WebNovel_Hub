import { type NovelSummary, epubFileName } from '@webnovel-hub/shared';
import { useMutation } from '@tanstack/react-query';
import { exportApi } from '../../api/catalog';
import { useToast } from '../../components/ui';
import { saveFile } from '../../lib/download';

export interface ExportEpubOptions {
  novel: Pick<NovelSummary, 'id' | 'title'>;
  storedChapters: number;
  totalChapters: number;
}

/**
 * Downloads the novel's stored chapters as an EPUB file. Chapters not stored yet are left
 * out; the toast says so.
 */
export function useExportEpub({ novel, storedChapters, totalChapters }: ExportEpubOptions) {
  const toast = useToast();
  return useMutation({
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
}
