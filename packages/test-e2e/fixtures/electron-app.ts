import { test as base, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { join } from 'path'

// Path to the packaged binary — override via env for CI
const ELECTRON_ENTRY =
  process.env['AURALITH_ELECTRON_ENTRY'] ??
  join(__dirname, '../../../apps/desktop/dist/main/index.js')
const TEST_DATA_DIR = process.env['AURALITH_TEST_DATA_DIR'] ?? join(__dirname, '..', '.test-data')

type ElectronFixtures = {
  electronApp: ElectronApplication
  page: Page
}

export const test = base.extend<ElectronFixtures>({
  electronApp: async ({}, use) => {
    const launchEnv = { ...process.env }
    delete launchEnv['ELECTRON_RUN_AS_NODE']

    const app = await electron.launch({
      args: [ELECTRON_ENTRY],
      env: {
        ...launchEnv,
        // Isolated data dir so tests don't share state
        AURALITH_DATA_DIR: TEST_DATA_DIR,
        AURALITH_E2E: '1',
        NODE_ENV: 'test',
      },
    })
    await use(app)
    await app.close()
  },

  page: async ({ electronApp }, use) => {
    const win = await electronApp.firstWindow()
    // Wait for the renderer to be ready
    await win.waitForLoadState('domcontentloaded')
    await use(win)
  },
})

export { expect } from '@playwright/test'
