import type { Page } from '@playwright/test'

export class SettingsPage {
  constructor(private readonly page: Page) {}

  async waitForReady(): Promise<void> {
    await this.page.waitForSelector('[data-testid="settings-screen"]', { timeout: 10_000 })
  }

  async navigateToTab(tab: string): Promise<void> {
    await this.page.click(`[data-testid="settings-tab-${tab}"]`)
  }

  async setWatchedFolder(path: string): Promise<void> {
    const input = this.page.locator('[data-testid="watched-folder-input"]')
    await input.fill(path)
    await this.page.click('[data-testid="watched-folder-add"]')
  }
}
