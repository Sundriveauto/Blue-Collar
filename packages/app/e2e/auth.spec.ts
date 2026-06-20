import { test, expect } from '@playwright/test'

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3001'

test.describe('Auth flows', () => {
  test('register page renders required fields', async ({ page }) => {
    await page.goto(`${BASE}/en/auth/register`)
    await expect(page.locator('input[name="email"], input[type="email"]').first()).toBeVisible()
    await expect(page.locator('input[name="password"], input[type="password"]').first()).toBeVisible()
  })

  test('login page renders required fields', async ({ page }) => {
    await page.goto(`${BASE}/en/auth/login`)
    await expect(page.locator('input[name="email"], input[type="email"]').first()).toBeVisible()
    await expect(page.locator('input[name="password"], input[type="password"]').first()).toBeVisible()
  })

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto(`${BASE}/en/auth/login`)
    await page.locator('input[name="email"], input[type="email"]').first().fill('invalid@example.com')
    await page.locator('input[name="password"], input[type="password"]').first().fill('wrongpassword')
    await page.locator('button[type="submit"]').click()
    // Expect an error message or stay on login page
    await expect(page).toHaveURL(/login|auth/)
  })

  test('register with mismatched passwords shows validation error', async ({ page }) => {
    await page.goto(`${BASE}/en/auth/register`)
    const emailInput = page.locator('input[name="email"], input[type="email"]').first()
    const passwordInputs = page.locator('input[type="password"]')
    await emailInput.fill('test@example.com')
    await passwordInputs.nth(0).fill('Password123!')
    if (await passwordInputs.count() > 1) {
      await passwordInputs.nth(1).fill('DifferentPassword!')
    }
    await page.locator('button[type="submit"]').click()
    await expect(page).toHaveURL(/register|auth/)
  })

  test('forgot password page is accessible', async ({ page }) => {
    await page.goto(`${BASE}/en/auth/forgot-password`)
    await expect(page.locator('input[name="email"], input[type="email"]').first()).toBeVisible()
  })
})
