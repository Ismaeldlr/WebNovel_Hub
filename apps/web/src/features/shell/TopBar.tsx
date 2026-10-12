import type { ThemePreference } from '@webnovel-hub/shared';
import {
  ArrowLeft,
  Coffee,
  type LucideIcon,
  Menu as MenuIcon,
  Monitor,
  Moon,
  MoonStar,
  Search,
  Sun,
} from 'lucide-react';
import { type Ref, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { HOME_PATH } from '../../app/navigation';
import { useTheme } from '../../app/theme';
import { BrandMark } from '../../components/BrandMark';
import { IconButton, Menu, MenuHeader, MenuItem } from '../../components/ui';
import { COMPACT_QUERY } from '../../lib/breakpoints';
import { type PageBar, useMediaQuery } from '../../lib/hooks';
import { THEME_OPTIONS } from '../preferences/readerStyle';
import { useUpdatePreferences } from '../preferences/usePreferences';
import { GlobalSearch } from './GlobalSearch';
import styles from './TopBar.module.css';

interface TopBarProps {
  /** Shows the menu button that opens the sidebar drawer (below 900 px). */
  drawer: boolean;
  drawerOpen: boolean;
  sidebarId: string;
  onOpenDrawer: () => void;
  menuButtonRef: Ref<HTMLButtonElement>;
  /** The page's title, shown in the bar on phones instead of the app's name. */
  pageTitle: string;
  /** What the page asks of the bar on phones. */
  pageBar: PageBar;
}

export function TopBar({
  drawer,
  drawerOpen,
  sidebarId,
  onOpenDrawer,
  menuButtonRef,
  pageTitle,
  pageBar,
}: TopBarProps) {
  // Phones have no room for the search box: a button opens it over the top bar.
  const compact = useMediaQuery(COMPACT_QUERY);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const closeSearch = () => {
    setSearchOpen(false);
    searchButtonRef.current?.focus();
  };

  const back = compact && pageBar.back;
  return (
    <header
      className={styles.topbar}
      data-topbar
      data-clear={(compact && pageBar.clear) || undefined}
    >
      {back ? (
        <BackButton />
      ) : (
        drawer && (
          <IconButton
            ref={menuButtonRef}
            label="Open menu"
            aria-expanded={drawerOpen}
            aria-controls={sidebarId}
            onClick={onOpenDrawer}
          >
            <MenuIcon aria-hidden="true" />
          </IconButton>
        )
      )}
      {/* Phones: the page's title (its h1 is for screen readers there). Tablets: the name. */}
      {compact ? (
        <p className={styles.pageTitle} aria-hidden="true">
          {pageTitle}
        </p>
      ) : (
        drawer && (
          <Link to={HOME_PATH} className={styles.brand}>
            <BrandMark className={styles.brandMark} />
            <span>Webnovel Hub</span>
          </Link>
        )
      )}

      {!compact ? <GlobalSearch /> : searchOpen && <GlobalSearch onClose={closeSearch} />}

      <div className={styles.actions}>
        {compact && (
          <IconButton
            ref={searchButtonRef}
            label="Search"
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen(true)}
          >
            <Search aria-hidden="true" />
          </IconButton>
        )}
        <ThemeMenu />
      </div>
    </header>
  );
}

/**
 * Back to the page the reader came from, or to the library when the page was opened
 * directly (nothing before it in this visit).
 */
function BackButton() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <IconButton
      label="Back"
      onClick={() => {
        if (location.key === 'default') void navigate(HOME_PATH);
        else void navigate(-1);
      }}
    >
      <ArrowLeft aria-hidden="true" />
    </IconButton>
  );
}

const THEME_ICONS: Record<ThemePreference, LucideIcon> = {
  system: Monitor,
  light: Sun,
  sepia: Coffee,
  dark: Moon,
  black: MoonStar,
};

/**
 * A quick way to the theme: the same list as the ThemePicker, saved to the reader's
 * preferences like any other change, so every page follows.
 */
export function ThemeMenu() {
  const { preference } = useTheme();
  const label = THEME_OPTIONS.find((option) => option.value === preference)?.label;
  const CurrentIcon = THEME_ICONS[preference];
  return (
    <Menu
      trigger={(props) => (
        <IconButton {...props} label={`Theme: ${label ?? 'Match device'}`}>
          <CurrentIcon aria-hidden="true" />
        </IconButton>
      )}
    >
      <ThemeMenuItems />
    </Menu>
  );
}

/** The theme choices as menu items: the theme menu's, and the account menu's on phones. */
function ThemeMenuItems() {
  const { preference } = useTheme();
  const update = useUpdatePreferences();
  return (
    <>
      <MenuHeader>Theme</MenuHeader>
      {THEME_OPTIONS.map(({ value, label: optionLabel }) => {
        const Icon = THEME_ICONS[value];
        return (
          <MenuItem
            key={value}
            checked={preference === value}
            icon={<Icon aria-hidden="true" />}
            onSelect={() => update({ theme: value })}
          >
            {optionLabel}
          </MenuItem>
        );
      })}
    </>
  );
}
