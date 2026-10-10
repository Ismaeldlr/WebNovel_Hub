import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { createQueryClient } from './app/queryClient';
import { ThemeProvider } from './app/ThemeProvider';
import { ToastProvider } from './components/ui';
import './styles/global.css';

// Offline reading is gone: forget what it kept in this browser. public/sw.js
// clears its saved chapters.
for (const key of ['webnovel-hub.last-user', 'webnovel-hub.offline-owner']) {
  try {
    localStorage.removeItem(key);
  } catch {
    // storage blocked: nothing was kept either
  }
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found');
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={createQueryClient()}>
      <ThemeProvider>
        <ToastProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
