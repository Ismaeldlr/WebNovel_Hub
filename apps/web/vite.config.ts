/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // One .env at the repository root is shared by every service.
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  resolve: {
    // Load workspace packages from their TypeScript source (see tsconfig.base.json).
    conditions: ['@webnovel-hub/source', ...defaultClientConditions],
  },
  // CLIENT_URL (the API's CORS origin) expects this exact port.
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  // Keep other services' output visible when running under `npm run dev`.
  clearScreen: false,
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Plain class names in tests, so they read like the source.
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
});
