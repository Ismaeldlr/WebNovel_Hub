import {
  BookOpen,
  BookPlus,
  CircleUser,
  FileDown,
  History,
  Library,
  type LucideIcon,
  RefreshCw,
  Settings,
} from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

/** The read-only navigation. No authoring entries, ever. */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Read',
    items: [
      { path: '/library', label: 'My Library', icon: Library },
      { path: '/reader', label: 'Continue Reading', icon: BookOpen },
      { path: '/add', label: 'Add Novels', icon: BookPlus },
    ],
  },
  {
    label: 'Activity',
    items: [
      { path: '/history', label: 'Reading History', icon: History },
      { path: '/updates', label: 'Update Jobs', icon: RefreshCw },
      { path: '/exports', label: 'Exports', icon: FileDown },
    ],
  },
  {
    label: 'You',
    items: [
      { path: '/profile', label: 'Profile', icon: CircleUser },
      { path: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

/** Where the app opens. */
export const HOME_PATH = '/library';

/** The library, showing only the novels with `tag`. */
export const libraryTagPath = (tag: string) =>
  `/library?${new URLSearchParams({ tag }).toString()}`;

/** The library showing one shelf (its id, or `hidden`). */
export const libraryShelfPath = (shelf: string) =>
  `/library?${new URLSearchParams({ shelf }).toString()}`;

/** The terms, searching for `text` (a novel's title, from the reader). */
export const termsSearchPath = (text: string) =>
  `/profile/terms?${new URLSearchParams({ q: text }).toString()}`;

/** The library, searching for `text` (the global search's "See all results"). */
export const librarySearchPath = (text: string) =>
  text ? `/library?${new URLSearchParams({ q: text }).toString()}` : '/library';
