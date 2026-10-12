import { type ComponentType, Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { AppGate } from './app/AppGate';
import { HOME_PATH } from './app/navigation';
import { Splash } from './components/Splash';
import { AppShell } from './features/shell/AppShell';
import { RouteErrorBoundary } from './features/shell/RouteErrorBoundary';

// Each page is its own bundle, loaded when first visited.
const ContinueReadingPage = lazy(() =>
  import('./features/pages/ContinueReadingPage').then((module) => ({
    default: module.ContinueReadingPage,
  })),
);
const NotFoundPage = lazy(() =>
  import('./features/pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })),
);

const LibraryPage = lazy(() =>
  import('./features/library/LibraryPage').then((module) => ({ default: module.LibraryPage })),
);
const AddNovelsPage = lazy(() =>
  import('./features/add/AddNovelsPage').then((module) => ({ default: module.AddNovelsPage })),
);
const NovelPage = lazy(() =>
  import('./features/novel/NovelPage').then((module) => ({ default: module.NovelPage })),
);
const ReaderPage = lazy(() =>
  import('./features/reader/ReaderPage').then((module) => ({ default: module.ReaderPage })),
);
const UpdateJobsPage = lazy(() =>
  import('./features/updates/UpdateJobsPage').then((module) => ({
    default: module.UpdateJobsPage,
  })),
);

const HistoryPage = lazy(() =>
  import('./features/history/HistoryPage').then((module) => ({ default: module.HistoryPage })),
);
const ProfilePage = lazy(() =>
  import('./features/profile/ProfilePage').then((module) => ({ default: module.ProfilePage })),
);
const TermsPage = lazy(() =>
  import('./features/terms/TermsPage').then((module) => ({ default: module.TermsPage })),
);

const ExportsPage = lazy(() =>
  import('./features/exports/ExportsPage').then((module) => ({ default: module.ExportsPage })),
);

const SettingsPage = lazy(() =>
  import('./features/settings/SettingsPage').then((module) => ({
    default: module.SettingsPage,
  })),
);

const PAGES: { path: string; Page: ComponentType }[] = [
  { path: 'library', Page: LibraryPage },
  { path: 'add', Page: AddNovelsPage },
  { path: 'novels/:novelId', Page: NovelPage },
  { path: 'reader', Page: ContinueReadingPage },
  { path: 'history', Page: HistoryPage },
  { path: 'updates', Page: UpdateJobsPage },
  { path: 'exports', Page: ExportsPage },
  { path: 'profile', Page: ProfilePage },
  { path: 'profile/terms', Page: TermsPage },
  { path: 'settings/:group?', Page: SettingsPage },
];

export function App() {
  return (
    <Suspense fallback={<Splash />}>
      <Routes>
        <Route element={<AppGate />}>
          {/* The reader hides the app shell. */}
          <Route
            path="reader/:novelId/:chapterNumber"
            element={
              <RouteErrorBoundary>
                <ReaderPage />
              </RouteErrorBoundary>
            }
          />
          <Route element={<AppShell />}>
            <Route index element={<Navigate to={HOME_PATH} replace />} />
            {PAGES.map(({ path, Page }) => (
              <Route key={path} path={path} element={<Page />} />
            ))}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
