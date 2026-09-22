import { expect, test } from '@playwright/test'

/**
 * Baseline screenshots for the major screens (§30, NF8.4) — protects the
 * design system against accidental drift later. Masks anything
 * time-dependent (arrival times, waiting-duration badges) so the test
 * doesn't flake on real, constantly-changing ER data.
 */
test.describe('Visual regression', () => {
  test('Home', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'HCopilot' })).toBeVisible()
    await expect(page).toHaveScreenshot('home.png', { fullPage: true })
  })

  test('ER ISBAR Entry — disabled state', async ({ page }) => {
    await page.goto('/isbar')
    await page.getByTestId('er-roster-row').first().waitFor({ timeout: 10000 })
    await expect(page).toHaveScreenshot('isbar-disabled.png', {
      fullPage: true,
      mask: [page.locator('[data-testid="er-roster-row"]')],
    })
  })

  test('Live ER Board', async ({ page }) => {
    await page.goto('/live-er')
    await page.getByTestId('placement-card').first().waitFor({ timeout: 10000 })
    await expect(page).toHaveScreenshot('live-er.png', {
      fullPage: true,
      mask: [page.getByTestId('placement-card'), page.locator('text=/Waiting > 5 min/').locator('..')],
    })
  })

  test('History', async ({ page }) => {
    await page.goto('/history')
    await page.locator('table tbody tr').first().waitFor({ timeout: 10000 })
    await expect(page).toHaveScreenshot('history.png', {
      fullPage: true,
      mask: [page.locator('table tbody')],
    })
  })

  test('Statistics', async ({ page }) => {
    await page.goto('/statistics')
    await page.getByText('Active Patients').waitFor({ timeout: 10000 })
    await expect(page).toHaveScreenshot('statistics.png', {
      fullPage: true,
      mask: [page.locator('main')],
    })
  })

  test('Settings', async ({ page }) => {
    await page.goto('/settings')
    await page.locator('table').waitFor({ timeout: 10000 })
    await expect(page).toHaveScreenshot('settings.png', {
      fullPage: true,
      mask: [page.locator('table tbody')],
    })
  })
})
