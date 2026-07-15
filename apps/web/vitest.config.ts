import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

const TEST_INCLUDE = [
  '__tests__/**/*.{test,spec}.{ts,tsx}',
  '**/*.{test,spec}.{ts,tsx}',
];

const TEST_EXCLUDE = [
  '**/node_modules/**',
  '**/.next/**',
  '**/coverage/**',
  '**/e2e/**',
];

// Suites matching this glob exercise the shared Postgres singletons behind
// DATABASE_URL: `embedding_rate_buckets`, `embedding_rate_leases`, and the
// single `embedding_provider_circuits` row. Their setup/teardown truncates or
// deletes that shared state, so two such files running in parallel workers
// race deterministically. They therefore run inside one dedicated project
// with file parallelism disabled — sequential relative to EACH OTHER only —
// while every other test file keeps normal parallelism in the default
// project. Add new singleton-Postgres suites under this naming convention
// (`__tests__/integration/*-postgres.test.ts`) to inherit the same isolation.
const DB_SINGLETON_SUITES = ['__tests__/integration/*-postgres.test.ts'];

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    css: false,
    projects: [
      {
        extends: true,
        test: {
          name: 'default',
          include: TEST_INCLUDE,
          exclude: [...TEST_EXCLUDE, ...DB_SINGLETON_SUITES],
        },
      },
      {
        extends: true,
        test: {
          name: 'db-singleton',
          include: DB_SINGLETON_SUITES,
          exclude: TEST_EXCLUDE,
          // One worker, one file at a time: deterministic ownership of the
          // shared limiter/circuit tables without serializing the whole suite.
          fileParallelism: false,
          maxWorkers: 1,
          minWorkers: 1,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      include: [
        'app/**/*.{js,jsx,ts,tsx}',
        'components/**/*.{js,jsx,ts,tsx}',
        'lib/**/*.{js,jsx,ts,tsx}',
        'hooks/**/*.{js,jsx,ts,tsx}',
      ],
      exclude: [
        '**/*.d.ts',
        '**/node_modules/**',
        '**/.next/**',
        '**/coverage/**',
        '**/*.config.*',
      ],
      thresholds: {
        branches: 60,
        functions: 25,
        lines: 8,
        statements: 8,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
