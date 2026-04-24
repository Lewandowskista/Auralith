import { test, expect } from '../fixtures/electron-app'
import { HomePage } from '../pages/home.page'

test.describe('Knowledge indexing', () => {
  test('brain screen loads and shows spaces list', async ({ page }) => {
    const home = new HomePage(page)
    await home.waitForReady()
    await home.navigateTo('brain')

    await page.waitForSelector('[data-testid="brain-screen"]', { timeout: 10_000 })
    // Spaces list or empty-state should be visible
    const spacesList = page.locator('[data-testid="spaces-list"], [data-testid="spaces-empty"]')
    await expect(spacesList.first()).toBeVisible()
  })

  test('can create a new knowledge space', async ({ page }) => {
    const home = new HomePage(page)
    await home.waitForReady()
    await home.navigateTo('brain')

    await page.waitForSelector('[data-testid="brain-screen"]', { timeout: 10_000 })
    await page.click('[data-testid="space-create-btn"]')
    await page.waitForSelector('[data-testid="space-name-input"]', { timeout: 5_000 })
    await page.fill('[data-testid="space-name-input"]', 'Test Space')
    await page.click('[data-testid="space-save-btn"]')

    // New space should appear in the list
    const spaceRow = page.locator('[data-testid="space-row"]', { hasText: 'Test Space' })
    await expect(spaceRow).toBeVisible({ timeout: 5_000 })
  })
})
