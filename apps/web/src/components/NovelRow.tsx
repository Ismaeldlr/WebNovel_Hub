import type { NovelSummary } from '@webnovel-hub/shared';
import { type ReactNode, useId } from 'react';
import { Link } from 'react-router';
import { Cover } from './Cover';
import styles from './NovelRow.module.css';

interface NovelRowProps {
  novel: Pick<NovelSummary, 'id' | 'title' | 'author' | 'coverUrl'>;
  /** What the list says about the novel, under its title and author. */
  children?: ReactNode;
  /** Buttons at the end of the row; below it on phones. */
  actions?: ReactNode;
}

/**
 * A novel in a list of rows (Reading History's novels, Exports): a small cover, the
 * title linking to the novel's page, the author, the list's details, and its actions.
 */
export function NovelRow({ novel, children, actions }: NovelRowProps) {
  const titleId = useId();
  return (
    <article className={styles.row} aria-labelledby={titleId}>
      <Cover title={novel.title} author={novel.author} coverUrl={novel.coverUrl} size="sm" />
      <div className={styles.main}>
        <h3 id={titleId} className={styles.title}>
          <Link to={`/novels/${novel.id}`}>{novel.title}</Link>
        </h3>
        {novel.author && <p className={styles.meta}>{novel.author}</p>}
        {children}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </article>
  );
}

/** The list NovelRows go in, one per item. */
export function NovelRowList({ children }: { children: ReactNode }) {
  return <ul className={styles.list}>{children}</ul>;
}

/** A line of details in a NovelRow, like the author's. */
export function NovelRowMeta({ children }: { children: ReactNode }) {
  return <p className={styles.meta}>{children}</p>;
}
