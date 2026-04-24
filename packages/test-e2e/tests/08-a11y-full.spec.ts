import { test, expect } from '../fixtures/electron-app'
import { analyzeA11y } from '../fixtures/a11y'
import { HomePage } from '../pages/home.page'

// Full axe-core scan across key screens. Fails on serious/critical violations.
const SCREENS: Array<{ name: string; nav: string; selector: string }> = [
  { name: 'Home', nav: 'home', selector: '[data-testid="nav-rail"]' },
  {
    name: 'Assistant',
    nav: 'assistant',
    selector: '[data-testid="assistant-input"], [data-testid="ollama-offline"]',
  },
  { name: 'Brain', nav: 'knowledge', selector: '[data-testid="brain-screen"]' },
  { name: 'Activity', nav: 'activity', selector: '[data-testid="activity-screen"]' },
  { name: 'News', nav: 'news', selector: '[data-testid="news-screen"]' },
]

for (const screen of SCREENS) {
  test(`${screen.name} has no serious/critical a11y violations`, async ({ page }) => {
    const home = new HomePage(page)
    await home.waitForReady()

    if (screen.nav !== 'home') {
      await home.navigateTo(screen.nav)
    }

    await page.waitForSelector(screen.selector, { timeout: 10_000 })

    const results = await analyzeA11y(page)

    const violations = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    )

    expect(
      violations,
      `${screen.name} a11y violations:\n${violations.map((v) => `  [${v.impact}] ${v.id}: ${v.description}`).join('\n')}`,
    ).toHaveLength(0)
  })
}

test('Settings screens have no serious/critical a11y violations', async ({ page }) => {
  const home = new HomePage(page)
  await home.waitForReady()
  await home.navigateTo('settings')
  await page.waitForSelector('[data-testid="settings-screen"]', { timeout: 10_000 })

  const results = await analyzeA11y(page)

  const violations = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  )

  expect(
    violations,
    `Settings a11y violations:\n${violations.map((v) => `  [${v.impact}] ${v.id}: ${v.description}`).join('\n')}`,
  ).toHaveLength(0)
})
