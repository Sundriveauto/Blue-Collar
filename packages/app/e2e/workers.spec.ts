import { test, expect } from '@playwright/test'

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3001'

test.describe('Worker search and discovery', () => {
  test('workers listing page loads', async ({ page }) => {
    await page.goto(`${BASE}/en/workers`)
    await expect(page).toHaveURL(/workers/)
    // Page should not show a 500 error
    await expect(page.locator('body')).not.toContainText('Internal Server Error')
  })

  test('workers page has search or filter UI', async ({ page }) => {
    await page.goto(`${BASE}/en/workers`)
    // Either a search input or category filter should be present
    const searchOrFilter = page.locator('input[type="search"], input[placeholder*="search" i], select, [role="combobox"]')
    await expect(searchOrFilter.first()).toBeVisible({ timeout: 10_000 })
  })

  test('worker detail page loads for a valid id pattern', async ({ page }) => {
    // Navigate to workers list first
    await page.goto(`${BASE}/en/workers`)
    // Try to find a worker card link
    const workerLink = page.locator('a[href*="/workers/"]').first()
    const count = await workerLink.count()
    if (count > 0) {
      await workerLink.click()
      await expect(page).toHaveURL(/workers\//)
      await expect(page.locator('body')).not.toContainText('Internal Server Error')
    } else {
      // No workers seeded — just verify the page renders without crashing
      await expect(page.locator('body')).toBeVisible()
    }
  })

  test('home page renders without errors', async ({ page }) => {
    await page.goto(`${BASE}/en`)
    await expect(page.locator('body')).not.toContainText('Internal Server Error')
    await expect(page.locator('body')).not.toContainText('Application error')
  })
})
