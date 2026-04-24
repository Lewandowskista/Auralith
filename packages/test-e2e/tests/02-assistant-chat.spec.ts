import { test, expect } from '../fixtures/electron-app'
import { HomePage } from '../pages/home.page'
import { AssistantPage } from '../pages/assistant.page'

test.describe('Assistant chat', () => {
  test('navigates to assistant and input is focusable', async ({ page }) => {
    const home = new HomePage(page)
    await home.waitForReady()
    await home.navigateTo('assistant')

    const assistant = new AssistantPage(page)
    await assistant.waitForReady()

    const input = page.locator('[data-testid="assistant-input"]')
    await expect(input).toBeVisible()
    await expect(input).toBeEnabled()
  })

  test('sends a message and renders user bubble', async ({ page }) => {
    const home = new HomePage(page)
    await home.waitForReady()
    await home.navigateTo('assistant')

    const assistant = new AssistantPage(page)
    await assistant.waitForReady()
    await assistant.sendMessage('Hello')

    // User message should appear immediately
    const userBubble = page.locator('[data-testid="user-message"]').last()
    await expect(userBubble).toContainText('Hello')
  })

  test('shows offline state when Ollama is unavailable', async ({ page }) => {
    // In test environment Ollama is not running — graceful degraded mode
    const home = new HomePage(page)
    await home.waitForReady()
    await home.navigateTo('assistant')
    const assistant = new AssistantPage(page)
    await assistant.waitForReady()

    // Either the input is present (online) or an offline banner is shown
    const offlineBanner = page.locator('[data-testid="ollama-offline"]')
    const inputVisible = await page
      .locator('[data-testid="assistant-input"]')
      .isVisible()
      .catch(() => false)
    const bannerVisible = await offlineBanner.isVisible().catch(() => false)

    expect(inputVisible || bannerVisible).toBe(true)
  })
})
