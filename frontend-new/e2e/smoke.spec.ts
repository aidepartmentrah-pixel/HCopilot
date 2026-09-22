import { expect, test } from '@playwright/test'

test('app shell loads with the real HCopilot modules in nav', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'HCopilot' })).toBeVisible()

  const nav = page.getByRole('navigation', { name: 'Primary' })
  for (const label of ['Home', 'ER ISBAR Entry', 'Live ER', 'History', 'Statistics', 'Settings']) {
    await expect(nav.getByRole('link', { name: new RegExp(label) })).toBeVisible()
  }
})

test('navigating between pages updates the URL, active nav item, and page title', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Live ER' }).click()
  await expect(page).toHaveURL(/\/live-er$/)
  await expect(page.getByRole('heading', { name: 'Live ER' })).toBeVisible()

  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'History' }).click()
  await expect(page).toHaveURL(/\/history$/)
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible()
})
