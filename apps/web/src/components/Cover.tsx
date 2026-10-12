import { useQuery } from '@tanstack/react-query';
import { type CSSProperties, useState } from 'react';
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

/** The cover's image as an address the page can show, read once and kept. */
function useCoverSource(coverUrl: string | null) {
  return useQuery({
    queryKey: ['cover', coverUrl],
    queryFn: () => coverSource(coverUrl ?? ''),
    enabled: coverUrl !== null,
    staleTime: Infinity,
  });
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
  const source = useCoverSource(coverUrl);
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

/**
 * The cover's image as the background of an empty, decorative element (`--cover` holds
 * it, for the caller's styles to blur or fade). Nothing without a cover.
 */
export function CoverBackdrop({
  coverUrl,
  className,
}: {
  coverUrl: string | null;
  className?: string;
}) {
  const source = useCoverSource(coverUrl);
  if (!source.data) return null;
  return (
    <div
      className={className}
      style={{ '--cover': `url(${JSON.stringify(source.data)})` } as CSSProperties}
      aria-hidden="true"
    />
  );
}
