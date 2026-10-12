import { useQuery } from '@tanstack/react-query';
import { BookOpen } from 'lucide-react';
import { Link } from 'react-router';
import { novelsApi } from '../../api/catalog';
import { queryKeys } from '../../app/queryClient';
import { Cover, CoverBackdrop } from '../../components/Cover';
import { progress, readerPath } from '../../lib/reading';
import { lastReadQuery } from '../history/lastRead';
import styles from './ContinueCard.module.css';

/**
 * The chapter read last, as a card over its novel's blurred cover: one tap goes back to
 * it. Nothing before anything was read.
 */
export function ContinueCard() {
  const last = useQuery(lastReadQuery);
  const novelId = last.data?.novel.id ?? '';
  const novel = useQuery({
    queryKey: queryKeys.novel(novelId),
    queryFn: ({ signal }) => novelsApi.get(novelId, signal),
    enabled: novelId !== '',
  });
  if (!last.data || !novel.data) return null;

  const { chapter } = last.data;
  const { title, author, coverUrl, library, totalChapters } = novel.data;
  const { percent } = progress(library, totalChapters);
  return (
    <Link to={readerPath(novelId, chapter.number)} className={styles.card}>
      <CoverBackdrop coverUrl={coverUrl} className={styles.backdrop} />
      <span className={styles.cover}>
        <Cover title={title} author={author} coverUrl={coverUrl} eager />
      </span>
      <span className={styles.text}>
        <span className={styles.eyebrow}>Continue reading</span>
        <span className={styles.title}>{title}</span>
        <span className={styles.chapter}>{chapter.title}</span>
        <span className={styles.bar} aria-hidden="true">
          <span style={{ width: `${percent}%` }} />
        </span>
      </span>
      <span className={styles.go} aria-hidden="true">
        <BookOpen />
      </span>
    </Link>
  );
}
