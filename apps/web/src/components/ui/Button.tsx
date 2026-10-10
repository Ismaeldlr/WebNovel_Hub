import type { ComponentProps, MouseEvent, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import styles from './Button.module.css';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

interface Appearance {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** A leading icon, decorative (the label says what the button does). */
  icon?: ReactNode;
  /** A trailing icon, e.g. the arrow of "Next". */
  iconEnd?: ReactNode;
  /** Stretch to the container's width. */
  block?: boolean;
}

function classes({ variant = 'secondary', size = 'md', block }: Appearance, extra?: string) {
  return [styles.button, styles[variant], size === 'sm' && styles.sm, block && styles.block, extra]
    .filter(Boolean)
    .join(' ');
}

export interface ButtonProps extends ComponentProps<'button'>, Appearance {
  /**
   * An action is running: shows a spinner and ignores clicks. The button stays focusable
   * (aria-disabled rather than disabled), so keyboard focus isn't lost meanwhile.
   */
  busy?: boolean;
}

export function Button({
  variant,
  size,
  icon,
  iconEnd,
  block,
  busy = false,
  className,
  type = 'button',
  onClick,
  children,
  ...rest
}: ButtonProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (busy) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
  return (
    <button
      type={type}
      className={classes({ variant, size, block }, className)}
      aria-busy={busy || undefined}
      aria-disabled={busy || undefined}
      onClick={handleClick}
      {...rest}
    >
      {busy ? <Spinner size="sm" decorative /> : icon}
      <span>{children}</span>
      {iconEnd}
    </button>
  );
}

export type ButtonLinkProps = LinkProps & Appearance;

/** A link that looks like a button, for navigation actions ("Add a novel"). */
export function ButtonLink({
  variant,
  size,
  icon,
  iconEnd,
  block,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={classes({ variant, size, block }, className)} {...rest}>
      {icon}
      <span>{children}</span>
      {iconEnd}
    </Link>
  );
}

export interface IconButtonProps extends Omit<ComponentProps<'button'>, 'aria-label'> {
  /** The accessible name, also shown as a tooltip: icon-only buttons need one. */
  label: string;
  size?: ButtonSize;
}

export function IconButton({
  label,
  size = 'md',
  className,
  type = 'button',
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={[styles.iconButton, size === 'sm' && styles.iconSm, className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
