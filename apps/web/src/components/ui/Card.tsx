import type { ComponentProps } from 'react';
import styles from './Card.module.css';

interface CardProps extends ComponentProps<'div'> {
  /** The element to render; `article` for self-contained items such as a novel. */
  as?: 'div' | 'article' | 'section';
}

/** A raised paper surface. In a list, put it inside the <li>. */
export function Card({ as: Element = 'div', className, ...rest }: CardProps) {
  return <Element className={[styles.card, className].filter(Boolean).join(' ')} {...rest} />;
}
