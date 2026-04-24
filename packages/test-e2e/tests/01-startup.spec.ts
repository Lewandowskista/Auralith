import { test, expect } from '../fixtures/electron-app'
import { analyzeA11y } from '../fixtures/a11y'
import { HomePage } from '../pages/home.page'

test.describe('Startup', () => {
  test('app opens and home screen renders within 2.5s', async ({ page }) => {
    const t0 = Date.now()
    const home = new HomePage(page)
    await home.waitForReady()
    const elapsed = Date.now() - t0
    // Startup perf budget: home screen interactive within 2.5s of window load
    expect(elapsed, `startup took ${elapsed}ms — budget is 2500ms`).toBeLessThan(2500)
  })

  test('home screen has no critical accessibility violations', async ({ page }) => {
    const home = new HomePage(page)
    await home.waitForReady()

    const results = await analyzeA11y(page)

    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    )
    expect(
      critical,
      `a11y violations: ${critical.map((v) => `${v.id}: ${v.description}`).join(', ')}`,
    ).toHaveLength(0)
  })

  test('window title is set', async ({ electronApp }) => {
    const win = await electronApp.firstWindow()
    const title = await win.title()
    expect(title).toBeTruthy()
  })
})
