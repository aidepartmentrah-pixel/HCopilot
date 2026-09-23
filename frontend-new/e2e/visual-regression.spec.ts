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
    // Not fullPage: this page's own real-time critical/O2 alert banners
    // (IsbarAlertsPanel) can appear or disappear between any two runs
    // depending on genuinely-live ER data, which changes the page's total
    // height even with `main` fully masked — a real, expected source of
    // flakiness for a full-page screenshot specifically (found during
    // V2.8's re-baseline). Clipped to the fixed-height shell instead,
    // which is what this test can actually assert consistently.
    await expect(page).toHaveScreenshot('statistics.png', {
      clip: { x: 0, y: 0, width: 1280, height: 64 },
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

  test('Predictions', async ({ page }) => {
    await page.goto('/predictions')
    await page.getByRole('heading', { name: 'Patient Flow Forecast' }).waitFor({ timeout: 10000 })
    // Whole main masked like Statistics (§V2.8 log): the chart/metadata
    // panel includes a real "Last Forecast Generated" client fetch
    // timestamp that legitimately differs between any two runs.
    await expect(page).toHaveScreenshot('predictions.png', {
      fullPage: true,
      mask: [page.locator('main')],
    })
  })
})
