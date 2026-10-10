// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  // Build output, including the Windows app's Rust build and the Android project's.
  globalIgnores([
    '**/dist/',
    '**/coverage/',
    'apps/desktop/src-tauri/target/',
    'apps/mobile/android/',
  ]),

  js.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  {
    // Tests assert on untyped JSON responses (supertest's `body` is `any`).
    files: ['**/*.test.ts', '**/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },

  {
    files: [
      '*.js',
      'packages/shared/**/*.ts',
      'packages/core/**/*.ts',
      'packages/platform-node/**/*.ts',
      'apps/web/vite.config.ts',
      'apps/mobile/capacitor.config.ts',
      'apps/mobile/runner/vite.config.ts',
    ],
    languageOptions: { globals: globals.node },
  },

  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },

  {
    // Removes the service worker offline reading left on devices.
    files: ['apps/web/public/sw.js'],
    languageOptions: { globals: globals.serviceworker },
  },

  {
    // Test helpers mix components and functions; Fast Refresh never loads them.
    files: ['apps/web/src/**/*.test.{ts,tsx}', 'apps/web/src/test/**/*.{ts,tsx}'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },

  // Must stay last: turns off stylistic rules that conflict with Prettier.
  prettier,
]);
