import { test, expect } from '@playwright/test'
import percySnapshot from '@percy/playwright'

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3001'

/**
 * Visual regression tests using Playwright's built-in screenshot comparison
 * and Percy for cloud-based visual regression testing.
 *
 * Local: Run `pnpm test:e2e --update-snapshots` to update baseline screenshots.
 * Percy: Snapshots are automatically uploaded to Percy on CI if PERCY_TOKEN is set.
 */
test.describe('Visual regression', () => {
  test('home page matches snapshot', async ({ page }) => {
    await page.goto(`${BASE}/en`)
    await page.waitForLoadState('networkidle')
    
    // Local snapshot comparison
    await expect(page).toHaveScreenshot('home.png', { maxDiffPixelRatio: 0.02 })
    
    // Percy snapshot (only runs if PERCY_TOKEN is set)
    if (process.env.PERCY_TOKEN) {
      await percySnapshot(page, 'Home Page')
    }
  })

  test('workers listing page matches snapshot', async ({ page }) => {
    await page.goto(`${BASE}/en/workers`)
    await page.waitForLoadState('networkidle')
    
    await expect(page).toHaveScreenshot('workers-list.png', { maxDiffPixelRatio: 0.02 })
    
    if (process.env.PERCY_TOKEN) {
      await percySnapshot(page, 'Workers Listing')
    }
  })

  test('worker profile page matches snapshot', async ({ page }) => {
    // Navigate to a worker profile (using a test worker ID)
    await page.goto(`${BASE}/en/workers/test-worker-1`)
    await page.waitForLoadState('networkidle')
    
    await expect(page).toHaveScreenshot('worker-profile.png', { maxDiffPixelRatio: 0.02 })
    
    if (process.env.PERCY_TOKEN) {
      await percySnapshot(page, 'Worker Profile')
    }
  })

  test('login page matches snapshot', async ({ page }) => {
    await page.goto(`${BASE}/en/auth/login`)
    await page.waitForLoadState('networkidle')
    
    await expect(page).toHaveScreenshot('login.png', { maxDiffPixelRatio: 0.02 })
    
    if (process.env.PERCY_TOKEN) {
      await percySnapshot(page, 'Login Page')
    }
  })

  test('register page matches snapshot', async ({ page }) => {
    await page.goto(`${BASE}/en/auth/register`)
    await page.waitForLoadState('networkidle')
    
    await expect(page).toHaveScreenshot('register.png', { maxDiffPixelRatio: 0.02 })
    
    if (process.env.PERCY_TOKEN) {
      await percySnapshot(page, 'Register Page')
    }
  })

  test('dashboard page matches snapshot', async ({ page }) => {
    // Note: This test assumes user is logged in or dashboard is accessible
    await page.goto(`${BASE}/en/dashboard`)
    await page.waitForLoadState('networkidle')
    
    await expect(page).toHaveScreenshot('dashboard.png', { maxDiffPixelRatio: 0.02 })
    
    if (process.env.PERCY_TOKEN) {
      await percySnapshot(page, 'Dashboard')
    }
  })
})
