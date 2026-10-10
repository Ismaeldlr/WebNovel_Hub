// Bundles the background runner's script into the Android app's web assets, after
// `cap sync` has copied the web app there: one classic script, no modules.
import { fileURLToPath } from 'node:url';
import { defaultClientConditions, defineConfig } from 'vite';

export default defineConfig({
  resolve: { conditions: ['@webnovel-hub/source', ...defaultClientConditions] },
  build: {
    target: 'es2020',
    outDir: fileURLToPath(new URL('../android/app/src/main/assets/public', import.meta.url)),
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL('checks.ts', import.meta.url)),
      formats: ['iife'],
      name: 'checks',
      fileName: () => 'runner.js',
    },
  },
});
