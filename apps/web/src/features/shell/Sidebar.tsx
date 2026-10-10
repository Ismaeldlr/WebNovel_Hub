import { useQuery } from '@tanstack/react-query';
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { type Ref, useId } from 'react';
import { Link, NavLink } from 'react-router';
import { libraryApi } from '../../api/catalog';
import { HOME_PATH, NAV_SECTIONS } from '../../app/navigation';
import { queryKeys } from '../../app/queryClient';
import { BrandMark } from '../../components/BrandMark';
import { IconButton } from '../../components/ui';
import { plural } from '../../lib/format';
import styles from './Sidebar.module.css';

/**
 * How often the NEW count is refreshed while the app is open. Reading a chapter or a
 * manual check refreshes it at once; this catches what the scheduled checks find.
 */
export const NEW_CHAPTERS_REFRESH_MS = 5 * 60_000;

interface SidebarProps {
  id: string;
  /** Below 900 px the sidebar is a drawer; `open` says whether it is showing. */
  drawer: boolean;
  open: boolean;
  /** Folded into a rail of icons (desktop only), with a button to unfold it. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onClose: () => void;
  onNavigate: () => void;
  ref?: Ref<HTMLElement>;
}

/**
 * The spine of the app. The current page is marked by an accent bar as well as
 * `aria-current` and a heavier label, never by colour alone.
 */
export function Sidebar({
  id,
  drawer,
  open,
  collapsed,
  onToggleCollapsed,
  onClose,
  onNavigate,
  ref,
}: SidebarProps) {
  const labelPrefix = useId();
  // Unread NEW chapters across the library, shown on My Library.
  const newChapters = useQuery({
    queryKey: queryKeys.newChaptersCount,
    queryFn: ({ signal }) => libraryApi.newChaptersCount(signal),
    refetchInterval: NEW_CHAPTERS_REFRESH_MS,
  });
  const newCount = newChapters.data ?? 0;
  return (
    <aside
      ref={ref}
      id={id}
      className={styles.sidebar}
      data-drawer={drawer || undefined}
      data-open={open || undefined}
      data-collapsed={collapsed || undefined}
      // A closed drawer is off screen: keep it out of the tab order and the accessibility tree.
      inert={drawer && !open}
      aria-label="Sidebar"
    >
      <div className={styles.brand}>
        <Link to={HOME_PATH} className={styles.brandLink} onClick={onNavigate}>
          <BrandMark className={styles.mark} />
          <span className={styles.wordmark}>Webnovel Hub</span>
        </Link>
        {drawer && (
          <IconButton label="Close menu" onClick={onClose}>
            <X aria-hidden="true" />
          </IconButton>
        )}
      </div>

      <nav className={styles.nav} aria-label="Main">
        {NAV_SECTIONS.map((section, index) => {
          const labelId = `${labelPrefix}-${index}`;
          return (
            <div key={section.label} className={styles.section}>
              <p id={labelId} className={styles.sectionLabel}>
                {section.label}
              </p>
              <ul aria-labelledby={labelId} className={styles.list}>
                {section.items.map(({ path, label, icon: Icon }) => (
                  <li key={path}>
                    <NavLink
                      to={path}
                      className={styles.link}
                      onClick={onNavigate}
                      title={collapsed ? label : undefined}
                    >
                      <Icon className={styles.icon} aria-hidden="true" />
                      <span className={styles.label}>{label}</span>
                      {path === HOME_PATH && newCount > 0 && (
                        <span className={styles.count}>
                          <span aria-hidden="true">{newCount.toLocaleString()}</span>
                          <span className="visually-hidden">
                            , {plural(newCount, 'new chapter')}
                          </span>
                        </span>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      {!drawer && (
        <div className={styles.foot}>
          <IconButton
            size="sm"
            label={collapsed ? 'Show the sidebar' : 'Fold the sidebar into icons'}
            aria-expanded={!collapsed}
            onClick={onToggleCollapsed}
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden="true" />
            ) : (
              <PanelLeftClose aria-hidden="true" />
            )}
          </IconButton>
        </div>
      )}
    </aside>
  );
}
