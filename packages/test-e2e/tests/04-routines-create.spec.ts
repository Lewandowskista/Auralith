import { test, expect } from '../fixtures/electron-app'
import { HomePage } from '../pages/home.page'
import { RoutinesPage } from '../pages/routines.page'

test.describe('Routines — create', () => {
  test('routines screen loads', async ({ page }) => {
    const home = new HomePage(page)
    await home.waitForReady()
    await home.navigateTo('routines')

    const routines = new RoutinesPage(page)
    await routines.waitForReady()

    // Either empty state or existing list
    const content = page.locator('[data-testid="routines-list"], [data-testid="routines-empty"]')
    await expect(content.first()).toBeVisible()
  })

  test('can open routine editor', async ({ page }) => {
    const home = new HomePage(page)
    await home.waitForReady()
    await home.navigateTo('routines')

    const routines = new RoutinesPage(page)
    await routines.waitForReady()

    await page.click('[data-testid="routine-create-btn"]')
    const editor = page.locator('[data-testid="routine-editor"]')
    await expect(editor).toBeVisible({ timeout: 5_000 })
  })

  test('routine editor has accessible form fields', async ({ page }) => {
    const home = new HomePage(page)
    await home.waitForReady()
    await home.navigateTo('routines')

    const routines = new RoutinesPage(page)
    await routines.waitForReady()
    await routines.createRoutine({ name: 'My Routine' })

    const nameInput = page.locator('[data-testid="routine-name-input"]')
    await expect(nameInput).toHaveValue('My Routine')
  })
})
