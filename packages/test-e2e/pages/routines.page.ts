import type { Page } from '@playwright/test'

export class RoutinesPage {
  constructor(private readonly page: Page) {}

  async waitForReady(): Promise<void> {
    await this.page.waitForSelector('[data-testid="routines-screen"]', { timeout: 10_000 })
  }

  async createRoutine(opts: { name: string }): Promise<void> {
    await this.page.click('[data-testid="routine-create-btn"]')
    await this.page.waitForSelector('[data-testid="routine-editor"]', { timeout: 5_000 })
    await this.page.fill('[data-testid="routine-name-input"]', opts.name)
  }

  async saveRoutine(): Promise<void> {
    await this.page.click('[data-testid="routine-save-btn"]')
  }

  async runRoutine(name: string): Promise<void> {
    const row = this.page.locator(`[data-testid="routine-row"]`, { hasText: name })
    await row.locator('[data-testid="routine-run-btn"]').click()
  }

  getRoutineRows() {
    return this.page.locator('[data-testid="routine-row"]')
  }
}
