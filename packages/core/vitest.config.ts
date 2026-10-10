import { defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Load workspace packages from their TypeScript source (see tsconfig.base.json).
  ssr: { resolve: { conditions: ['@webnovel-hub/source', ...defaultServerConditions] } },
  test: {
    environment: 'node',
    // node:sqlite needs this flag on Node 22.12.
    execArgv: ['--experimental-sqlite', '--no-warnings=ExperimentalWarning'],
  },
});
