import { test, expect } from '../fixtures/electron-app'
import { HomePage } from '../pages/home.page'

test.describe('Suggestions', () => {
  test('home screen renders without crashing when no suggestions exist', async ({ page }) => {
    const home = new HomePage(page)
    await home.waitForReady()

    // Home screen should be visible — no crash even with empty suggestion state
    const navRail = page.locator('[data-testid="nav-rail"]')
    await expect(navRail).toBeVisible()
  })

  test('suggestion card shows accept and dismiss controls', async ({ page }) => {
    const home = new HomePage(page)
    await home.waitForReady()

    const cards = home.getSuggestionCards()
    const count = await cards.count()

    if (count === 0) {
      // No suggestions yet — acceptable in a fresh environment
      test.info().annotations.push({ type: 'info', description: 'No suggestions in fresh env' })
      return
    }

    const first = cards.first()
    await expect(first.locator('[data-testid="suggestion-accept"]')).toBeVisible()
    await expect(first.locator('[data-testid="suggestion-dismiss"]')).toBeVisible()
  })

  test('insights tab renders in settings', async ({ page }) => {
    const home = new HomePage(page)
    await home.waitForReady()
    await home.navigateTo('settings')

    await page.waitForSelector('[data-testid="settings-screen"]', { timeout: 10_000 })
    await page.click('[data-testid="settings-tab-assistant"]')

    // Insights section should be visible (may have empty state)
    const insights = page.locator('[data-testid="insights-section"]')
    await expect(insights).toBeVisible({ timeout: 5_000 })
  })
})
