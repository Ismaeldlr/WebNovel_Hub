import { useQuery } from '@tanstack/react-query';
import { HIDDEN_SHELF } from '@webnovel-hub/shared';
import { ChevronDown, EyeOff, PanelLeftClose, PanelLeftOpen, Settings2, X } from 'lucide-react';
import { type ReactNode, type Ref, useId, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { libraryApi, shelvesApi } from '../../api/catalog';
import { HOME_PATH, NAV_SECTIONS, libraryShelfPath } from '../../app/navigation';
import { queryKeys } from '../../app/queryClient';
import { BrandMark } from '../../components/BrandMark';
import { IconButton } from '../../components/ui';
import { plural } from '../../lib/format';
import { EditShelvesDialog } from '../library/Shelves';
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
                  <li key={path} className={path === HOME_PATH ? styles.withShelves : undefined}>
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
                    {path === HOME_PATH && !collapsed && <ShelvesNav onNavigate={onNavigate} />}
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

/** Whether the shelves under My Library are shown, kept for the next visit. */
const SHELVES_OPEN_KEY = 'webnovel-hub.sidebar-shelves';

function shelvesOpenAtFirst(): boolean {
  try {
    return localStorage.getItem(SHELVES_OPEN_KEY) === 'open';
  } catch {
    return false;
  }
}

/**
 * The shelves under My Library, folded away until the arrow opens them: each shelf, the
 * hidden novels once there are some, and a way to edit the shelves. They load only while
 * open.
 */
function ShelvesNav({ onNavigate }: { onNavigate: () => void }) {
  const [open, setOpen] = useState(shelvesOpenAtFirst);
  const [editing, setEditing] = useState(false);
  const listId = useId();
  const location = useLocation();
  const shelves = useQuery({
    queryKey: queryKeys.shelves,
    queryFn: ({ signal }) => shelvesApi.list(signal),
    enabled: open,
  });
  const stats = useQuery({
    queryKey: queryKeys.libraryStats,
    queryFn: ({ signal }) => libraryApi.stats(signal),
    enabled: open,
  });
  const shown =
    location.pathname === HOME_PATH ? new URLSearchParams(location.search).get('shelf') : null;

  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(SHELVES_OPEN_KEY, open ? 'closed' : 'open');
    } catch {
      // Not kept for the next visit.
    }
  };

  const link = (shelf: string, label: string, count: number, icon?: ReactNode) => (
    <li key={shelf}>
      <Link
        to={libraryShelfPath(shelf)}
        className={styles.link}
        data-shelf
        aria-current={shown === shelf ? 'page' : undefined}
        onClick={onNavigate}
      >
        {icon}
        <span className={styles.label}>{label}</span>
        <span className={styles.shelfCount}>{count.toLocaleString()}</span>
      </Link>
    </li>
  );

  return (
    <>
      <button
        type="button"
        className={styles.shelvesToggle}
        aria-expanded={open}
        aria-controls={listId}
        aria-label="Shelves"
        title={open ? 'Hide your shelves' : 'Show your shelves'}
        onClick={toggle}
      >
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <ul id={listId} className={styles.shelves} aria-label="Shelves">
          {shelves.data?.map((shelf) => link(shelf.id, shelf.name, shelf.novels))}
          {(stats.data?.hidden ?? 0) > 0 &&
            link(
              HIDDEN_SHELF,
              'Hidden',
              stats.data!.hidden,
              <EyeOff className={styles.shelfIcon} aria-hidden="true" />,
            )}
          <li>
            <button
              type="button"
              className={styles.link}
              data-shelf
              onClick={() => setEditing(true)}
            >
              <Settings2 className={styles.shelfIcon} aria-hidden="true" />
              <span className={styles.label}>
                {shelves.data?.length === 0 ? 'Make a shelf' : 'Edit shelves'}
              </span>
            </button>
          </li>
        </ul>
      )}
      <EditShelvesDialog open={editing} onClose={() => setEditing(false)} />
    </>
  );
}
