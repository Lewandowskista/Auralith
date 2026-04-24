import { test, expect } from '../fixtures/electron-app'
import { HomePage } from '../pages/home.page'

test.describe('Voice I/O', () => {
  test('voice settings tab loads', async ({ page }) => {
    const home = new HomePage(page)
    await home.waitForReady()
    await home.navigateTo('settings')

    await page.waitForSelector('[data-testid="settings-screen"]', { timeout: 10_000 })
    await page.click('[data-testid="settings-tab-voice"]')

    const voiceSection = page.locator('[data-testid="voice-section"]')
    await expect(voiceSection).toBeVisible({ timeout: 5_000 })
  })

  test('voice enable toggle is accessible', async ({ page }) => {
    const home = new HomePage(page)
    await home.waitForReady()
    await home.navigateTo('settings')

    await page.waitForSelector('[data-testid="settings-screen"]', { timeout: 10_000 })
    await page.click('[data-testid="settings-tab-voice"]')

    await page.waitForSelector('[data-testid="voice-section"]', { timeout: 5_000 })

    const toggle = page.locator('[data-testid="voice-enable-toggle"]')
    await expect(toggle).toBeVisible()
    // Toggle should have an accessible label
    const ariaLabel = await toggle.getAttribute('aria-label')
    const labelText = await page
      .locator(`label[for="${await toggle.getAttribute('id')}"]`)
      .textContent()
      .catch(() => null)
    expect(ariaLabel ?? labelText).toBeTruthy()
  })

  test('STT model list renders', async ({ page }) => {
    const home = new HomePage(page)
    await home.waitForReady()
    await home.navigateTo('settings')

    await page.waitForSelector('[data-testid="settings-screen"]', { timeout: 10_000 })
    await page.click('[data-testid="settings-tab-voice"]')

    await page.waitForSelector('[data-testid="voice-section"]', { timeout: 5_000 })

    // Models section should be visible (even if empty)
    const modelsSection = page.locator('[data-testid="stt-models"]')
    await expect(modelsSection).toBeVisible({ timeout: 5_000 })
  })
})
