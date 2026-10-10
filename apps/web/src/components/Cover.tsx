import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiDownload } from '../api/client';
import styles from './Cover.module.css';

interface CoverProps {
  title: string;
  author: string | null;
  coverUrl: string | null;
  size?: 'sm' | 'md' | 'lg';
  /** Load at once (the novel page's hero) instead of when scrolled into view. */
  eager?: boolean;
}

// A cover's address changes with the cover, so each one is read once and kept.
const objectUrls = new Map<string, string>();

async function coverSource(coverUrl: string): Promise<string> {
  let url = objectUrls.get(coverUrl);
  if (url === undefined) {
    url = URL.createObjectURL(await apiDownload(coverUrl));
    objectUrls.set(coverUrl, url);
  }
  return url;
}

/**
 * A novel's stored cover. Without one, or if it can't be shown, a plain stand-in with the
 * title. Decorative: the title is always next to it.
 */
export function Cover({ title, author, coverUrl, size = 'md', eager = false }: CoverProps) {
  const [failed, setFailed] = useState(false);
  const source = useQuery({
    queryKey: ['cover', coverUrl],
    queryFn: () => coverSource(coverUrl ?? ''),
    enabled: coverUrl !== null,
    staleTime: Infinity,
  });
  if (source.data && !failed) {
    return (
      <img
        className={styles.cover}
        data-size={size}
        src={source.data}
        alt=""
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className={`${styles.cover} ${styles.placeholder}`} data-size={size} aria-hidden="true">
      <span className={styles.placeholderTitle}>{title}</span>
      {author && <span className={styles.placeholderAuthor}>{author}</span>}
    </div>
  );
}
