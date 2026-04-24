import { test, expect } from '../fixtures/electron-app'
import { HomePage } from '../pages/home.page'

const SOAK_DURATION_MS = 4 * 60 * 60 * 1000 // 4 hours
const TICK_INTERVAL_MS = 5 * 60 * 1000 // check every 5 minutes

test.describe('Soak test (4-hour idle run)', () => {
  test('app stays alive and responsive for 4 hours', async ({ page }) => {
    test.setTimeout(SOAK_DURATION_MS + 60_000)

    const home = new HomePage(page)
    await home.waitForReady()

    const deadline = Date.now() + SOAK_DURATION_MS
    let tick = 0

    while (Date.now() < deadline) {
      await page.waitForTimeout(TICK_INTERVAL_MS)
      tick++

      // Verify the app window is still alive
      const navRail = page.locator('[data-testid="nav-rail"]')
      const visible = await navRail.isVisible().catch(() => false)
      expect(visible, `Tick ${tick}: nav-rail not visible — app may have crashed`).toBe(true)

      // Navigate around to exercise the renderer
      const screens = ['home', 'assistant', 'activity', 'news', 'home']
      for (const screen of screens) {
        await home.navigateTo(screen).catch(() => null)
        await page.waitForTimeout(500)
      }
    }
  })
})
