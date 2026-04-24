import { test, expect } from '../fixtures/electron-app'
import { HomePage } from '../pages/home.page'

test.describe('Offline / Ollama unavailable', () => {
  // In the test environment, Ollama is not running. All UI should degrade gracefully.

  test('app loads without Ollama running', async ({ page }) => {
    const home = new HomePage(page)
    // If Ollama is not available, startup should still succeed
    await home.waitForReady()
    const navRail = page.locator('[data-testid="nav-rail"]')
    await expect(navRail).toBeVisible()
  })

  test('news screen shows empty state without crashing', async ({ page }) => {
    const home = new HomePage(page)
    await home.waitForReady()
    await home.navigateTo('news')

    // News screen should render (empty or populated — not crashed)
    const newsScreen = page.locator('[data-testid="news-screen"]')
    await expect(newsScreen).toBeVisible({ timeout: 10_000 })
  })

  test('privacy settings show crash stats section', async ({ page }) => {
    const home = new HomePage(page)
    await home.waitForReady()
    await home.navigateTo('settings')

    await page.waitForSelector('[data-testid="settings-screen"]', { timeout: 10_000 })
    await page.click('[data-testid="settings-tab-privacy"]')

    const crashStats = page.locator('[data-testid="crash-stats-section"]')
    await expect(crashStats).toBeVisible({ timeout: 5_000 })
  })
})
