import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { onTestFinished } from 'vitest';
import { App } from '../App';
import { createQueryClient } from '../app/queryClient';
import { ThemeProvider } from '../app/ThemeProvider';
import { ToastProvider } from '../components/ui';
import { saverFor } from '../features/preferences/store';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

/** Renders the whole app at `path`, with the same providers as main.tsx. */
export function renderApp(path = '/') {
  const queryClient = createQueryClient();
  // Fail fast in tests instead of retrying with a delay.
  const defaults = queryClient.getDefaultOptions();
  queryClient.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, retry: false } });
  // A preference save still waiting must not reach the next test's fake API.
  onTestFinished(() => saverFor(queryClient).forget());
  const user = userEvent.setup();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <App />
            <LocationProbe />
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return { ...view, user, queryClient };
}
