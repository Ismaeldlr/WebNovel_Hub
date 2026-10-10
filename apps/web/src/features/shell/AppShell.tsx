import { Suspense, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { SkipLink, Spinner } from '../../components/ui';
import { BELOW_DESKTOP_QUERY } from '../../lib/breakpoints';
import { PageTitleContext, useDismiss, useMediaQuery } from '../../lib/hooks';
import styles from './AppShell.module.css';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

const SIDEBAR_ID = 'app-sidebar';

/**
 * The signed-in layout: sidebar, top bar and the page. Below 900 px
 * the sidebar becomes a drawer; while it is open, the rest of the page is inert, Escape or
 * a tap outside closes it, and focus returns to the menu button.
 */
export function AppShell() {
  const drawer = useMediaQuery(BELOW_DESKTOP_QUERY);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const open = drawer && drawerOpen;
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const [pageTitle, setPageTitle] = useState('');
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggleCollapsed = () => {
    setCollapsed(!collapsed);
    storeCollapsed(!collapsed);
  };

  const closeDrawer = (returnFocus: boolean) => {
    setDrawerOpen(false);
    if (returnFocus) menuButtonRef.current?.focus();
  };

  useDismiss(open, [sidebarRef], () => closeDrawer(true));

  // Opening the drawer puts focus on the current page's link (or the first link).
  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!open || !sidebar) return;
    const current = sidebar.querySelector<HTMLElement>('nav [aria-current="page"]');
    (current ?? sidebar.querySelector<HTMLElement>('nav a'))?.focus();
  }, [open]);

  // After navigating, start at the top and move focus to the new page, as a full page
  // load would; skipped on the first render so focus isn't stolen on load.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  // A drawer that closes with focus inside it (e.g. its link to the current page) would
  // strand focus in an inert element; hand it back to the menu button.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open && sidebarRef.current?.contains(document.activeElement)) {
      menuButtonRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  return (
    <div className={styles.shell}>
      <SkipLink href="#main">Skip to content</SkipLink>
      <Sidebar
        ref={sidebarRef}
        id={SIDEBAR_ID}
        drawer={drawer}
        open={open}
        collapsed={!drawer && collapsed}
        onToggleCollapsed={toggleCollapsed}
        onClose={() => closeDrawer(true)}
        onNavigate={() => closeDrawer(false)}
      />
      {open && <div className={styles.scrim} aria-hidden="true" />}
      <div className={styles.column} inert={open}>
        <TopBar
          drawer={drawer}
          drawerOpen={open}
          sidebarId={SIDEBAR_ID}
          onOpenDrawer={() => setDrawerOpen(true)}
          menuButtonRef={menuButtonRef}
          pageTitle={pageTitle}
        />
        <main id="main" ref={mainRef} tabIndex={-1} className={styles.main}>
          <RouteErrorBoundary key={location.pathname}>
            <Suspense fallback={<PageLoading />}>
              <PageTitleContext value={setPageTitle}>
                <Outlet />
              </PageTitleContext>
            </Suspense>
          </RouteErrorBoundary>
        </main>
      </div>
    </div>
  );
}

/** Whether the sidebar is folded into a rail of icons: remembered on this device only. */
const COLLAPSED_STORAGE_KEY = 'webnovel-hub.sidebar-collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function storeCollapsed(collapsed: boolean) {
  try {
    if (collapsed) localStorage.setItem(COLLAPSED_STORAGE_KEY, 'true');
    else localStorage.removeItem(COLLAPSED_STORAGE_KEY);
  } catch {
    // Not remembered; still applied for this visit.
  }
}

function PageLoading() {
  return (
    <div className={styles.pageLoading}>
      <Spinner size="lg" label="Loading the page" />
    </div>
  );
}
