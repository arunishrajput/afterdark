// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import { reactRefresh } from 'eslint-plugin-react-refresh';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/coverage/',
    'playwright-report/',
    'test-results/',
    'blob-report/',
    'trailer/', // standalone Remotion project (marketing video), not part of the game
    'marketing/', // launch-post assets and their render script, not part of the game
  ]),

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // Tooling configs that sit outside every package's tsconfig.json.
          allowDefaultProject: ['apps/client/vite.config.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always'],
    },
  },

  // Plain JS config files are not part of any tsconfig project.
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  // Node code: server, shared, bots, root tooling, e2e.
  {
    files: ['apps/server/**', 'packages/**', 'tools/**', '*.ts', 'e2e/**'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/server/src/**', 'packages/shared/src/**'],
    rules: { 'no-console': 'error' },
  },
  // The balance script is a command-line tool: printing is its output.
  {
    files: ['apps/server/src/sim/cli.ts'],
    rules: { 'no-console': 'off' },
  },

  // Invariant 5: the engine and views are pure. Inject the clock and RNG.
  {
    files: ['apps/server/src/engine/**', 'apps/server/src/views/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'Inject the clock (Invariant 5).' },
        { object: 'Math', property: 'random', message: 'Inject the seeded RNG (Invariant 5).' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Inject the clock (Invariant 5).',
        },
      ],
    },
  },

  // React client.
  {
    files: ['apps/client/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite()],
    languageOptions: { globals: globals.browser },
  },

  prettier,
);
