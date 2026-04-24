import type { Page } from '@playwright/test'

export class AssistantPage {
  constructor(private readonly page: Page) {}

  async waitForReady(): Promise<void> {
    await this.page.waitForSelector('[data-testid="assistant-input"]', { timeout: 10_000 })
  }

  async sendMessage(text: string): Promise<void> {
    const input = this.page.locator('[data-testid="assistant-input"]')
    await input.click()
    await input.fill(text)
    await this.page.keyboard.press('Enter')
  }

  async waitForResponse(): Promise<string> {
    // Wait for the assistant message bubble to appear
    const bubble = this.page.locator('[data-testid="assistant-message"]').last()
    await bubble.waitFor({ state: 'visible', timeout: 30_000 })
    return bubble.innerText()
  }

  getMessages() {
    return this.page.locator('[data-testid="assistant-message"]')
  }
}
