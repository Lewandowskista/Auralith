import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // Electron runs one window at a time
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI']
    ? [['github'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['list']],
  use: {
    // Screenshot on failure
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'electron',
      use: {
        // Custom launcher set in global setup
      },
      testMatch: 'tests/[0-9]*.spec.ts',
    },
    {
      name: 'soak',
      use: {},
      testMatch: 'tests/soak.spec.ts',
      timeout: 4 * 60 * 60 * 1000, // 4 hours
    },
  ],
  globalSetup: './fixtures/global-setup.ts',
  globalTeardown: './fixtures/global-teardown.ts',
})
