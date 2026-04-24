import type { Page } from '@playwright/test'

export class HomePage {
  constructor(private readonly page: Page) {}

  async waitForReady(): Promise<void> {
    // Home screen is the default view — wait for the nav rail
    await this.page.waitForSelector('[data-testid="nav-rail"]', { timeout: 15_000 })
  }

  async openCommandPalette(): Promise<void> {
    await this.page.keyboard.press('Control+K')
    await this.page.waitForSelector('[data-testid="command-palette"]', { timeout: 5_000 })
  }

  async navigateTo(section: string): Promise<void> {
    const navSection =
      section === 'brain' ? 'knowledge' : section === 'routines' ? 'automations' : section
    await this.page.click(`[data-testid="nav-${navSection}"]`)
  }

  getSuggestionCards() {
    return this.page.locator('[data-testid="suggestion-card"]')
  }
}
