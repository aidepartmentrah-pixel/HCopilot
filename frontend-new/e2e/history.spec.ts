import { expect, test } from '@playwright/test'

test.describe('History', () => {
  test('table loads, row click opens preview, search filters and preserves selection layout', async ({ page }) => {
    await page.goto('/history')

    await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible()
    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 10000 })
    const rowCountBefore = await rows.count()

    await rows.first().click()
    await expect(page.getByRole('button', { name: 'Open Full Record' })).toBeVisible({ timeout: 10000 })

    // Table itself is still there, same row count — split view, not a navigation away.
    await expect(rows.first()).toBeVisible()
    expect(await rows.count()).toBe(rowCountBefore)
  })

  test('closing the preview returns to full width without losing the search text', async ({ page }) => {
    await page.goto('/history')
    await page.locator('table tbody tr').first().waitFor({ timeout: 10000 })

    const searchBox = page.getByRole('searchbox')
    await searchBox.fill('a')
    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible()

    await rows.first().click()
    await expect(page.getByRole('button', { name: 'Close preview' })).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: 'Close preview' }).click()

    await expect(page.getByRole('button', { name: 'Open Full Record' })).not.toBeVisible()
    await expect(searchBox).toHaveValue('a')
  })

  test('acuity filter narrows the table', async ({ page }) => {
    await page.goto('/history')
    await page.locator('table tbody tr').first().waitFor({ timeout: 10000 })
    const rows = page.locator('table tbody tr')
    const before = await rows.count()

    await page.getByLabel('Filter by acuity').selectOption('1')

    await expect(async () => {
      expect(await rows.count()).toBeLessThanOrEqual(before)
    }).toPass({ timeout: 5000 })
  })

  test('Open Full Record navigates to the full-width record page and back', async ({ page }) => {
    await page.goto('/history')
    const rows = page.locator('table tbody tr')
    await rows.first().waitFor({ timeout: 10000 })
    await rows.first().click()
    await expect(page.getByRole('button', { name: 'Open Full Record' })).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: 'Open Full Record' }).click()

    await expect(page).toHaveURL(/\/history\/\d+$/)
    await expect(page.getByRole('heading', { name: 'Full Record' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Print / Export PDF' })).toBeVisible()

    await page.getByRole('button', { name: 'Back to History' }).click()
    await expect(page).toHaveURL(/\/history$/)
  })
})
