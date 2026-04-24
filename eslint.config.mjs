import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'
import prettier from 'eslint-config-prettier'

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/.vite/**',
      '**/coverage/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            'apps/desktop/tailwind.config.ts',
            'apps/desktop/vite.renderer.config.ts',
            'apps/desktop/vitest.config.ts',
            'packages/core-ai/vitest.config.ts',
            'packages/core-db/vitest.config.ts',
            'packages/core-domain/vitest.config.ts',
            'packages/core-events/vitest.config.ts',
            'packages/core-ingest/vitest.config.ts',
            'packages/core-news/vitest.config.ts',
            'packages/core-retrieval/vitest.config.ts',
            'packages/core-scheduler/vitest.config.ts',
            'packages/core-suggest/vitest.config.ts',
            'packages/core-tools/vitest.config.ts',
            'packages/core-weather/vitest.config.ts',
            'packages/design-system/vitest.config.ts',
            'packages/test-utils/vitest.config.ts',
            'vitest.config.ts',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs['recommended'].rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  prettier,
]
