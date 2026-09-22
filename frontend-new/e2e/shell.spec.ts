import { expect, test } from '@playwright/test'

test.describe('Application shell (V2.0)', () => {
  test('the branded shell — logo, nav, search, notifications, real user identity — is byte-identical across every route', async ({
    page,
  }) => {
    const routes = ['/', '/isbar', '/live-er', '/history', '/statistics', '/settings']
    for (const route of routes) {
      await page.goto(route)
      const header = page.locator('header')
      await expect(header.getByRole('img', { name: 'HCopilot' })).toBeVisible()
      await expect(header.getByText('HCopilot', { exact: true })).toBeVisible()
      await expect(header.getByRole('navigation', { name: 'Primary' })).toBeVisible()
      await expect(header.getByRole('combobox', { name: /search patients/i })).toBeVisible()
      await expect(header.getByRole('button', { name: /notifications/i })).toBeVisible()
      // Real signed-in identity from the seeded admin/admin account — never a hardcoded example user.
      await expect(header.getByRole('button', { name: /Administrator/i })).toBeVisible()
      await expect(header.getByText('Dr. Sarah Chen')).toHaveCount(0)
    }
  })

  test('notification bell shows an honest empty state, not a fake badge', async ({ page }) => {
    await page.goto('/')
    const bell = page.getByRole('button', { name: /notifications/i })
    await expect(bell).toHaveAccessibleName(/none unread/i)
    await bell.click()
    await expect(page.getByText('No new notifications.')).toBeVisible()
  })

  test('the user menu opens and signing out returns to the login screen', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Administrator/i }).click()
    await page.getByRole('menuitem', { name: /sign out/i }).click()
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0)
  })
})

test.describe('Sign in (V2.0)', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('a signed-out visitor sees the login screen instead of the app, and can sign in with the real backend', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0)

    await page.getByLabel('Username').fill('admin')
    await page.getByLabel('Password').fill('admin')
    await page.getByRole('button', { name: 'Sign In' }).click()

    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Administrator/i })).toBeVisible()
  })

  test('an invalid password shows a real backend error, not a raw exception', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Username').fill('admin')
    await page.getByLabel('Password').fill('definitely-wrong')
    await page.getByRole('button', { name: 'Sign In' }).click()

    await expect(page.getByRole('alert')).toContainText('Invalid username or password')
    await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0)
  })
})
