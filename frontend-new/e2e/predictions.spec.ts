import { expect, test } from '@playwright/test'

test.describe('Predictions (V2.7)', () => {
  test('Patient Flow Forecast renders with real KPIs, chart, and metadata', async ({ page }) => {
    await page.goto('/predictions')

    await expect(page.getByRole('heading', { name: 'Predictions', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Patient Flow Forecast' })).toBeVisible({ timeout: 10000 })

    await expect(page.getByText('Average Daily Patients')).toBeVisible()
    await expect(page.getByText('Maximum Daily Patients')).toBeVisible()
    await expect(page.getByText('Minimum Daily Patients')).toBeVisible()
    await expect(page.getByText('Total Historical Records')).toBeVisible()

    await expect(page.getByRole('heading', { name: 'Patient Flow — Historical vs Forecast' })).toBeVisible()
    await expect(page.locator('.recharts-responsive-container')).toBeVisible()

    await expect(page.getByRole('heading', { name: 'Production Model' })).toBeVisible()
    await expect(page.getByText('Flow Prediction Model')).toBeVisible()
    await expect(page.getByText('Algorithm')).toBeVisible()
    await expect(page.getByText('XGBoost')).toBeVisible()
  })

  test('the forecast horizon defaults to 30 days and switching re-requests a real forecast', async ({ page }) => {
    await page.goto('/predictions')
    await page.getByRole('heading', { name: 'Patient Flow Forecast' }).waitFor({ timeout: 10000 })

    const horizon30 = page.getByRole('radio', { name: '30 Days' })
    const horizon90 = page.getByRole('radio', { name: '90 Days' })
    await expect(horizon30).toHaveAttribute('aria-checked', 'true')

    const forecastRequest = page.waitForResponse((res) => res.url().includes('/api/flow-prediction/predict?days=90'))
    await horizon90.click()
    const response = await forecastRequest
    expect(response.ok()).toBe(true)
    await expect(horizon90).toHaveAttribute('aria-checked', 'true')
    await expect(horizon30).toHaveAttribute('aria-checked', 'false')
  })

  test('switching to Table view shows exact forecast values reusing the standard table', async ({ page }) => {
    await page.goto('/predictions')
    await page.getByRole('heading', { name: 'Patient Flow Forecast' }).waitFor({ timeout: 10000 })

    await page.getByRole('button', { name: 'Show table view' }).click()
    await expect(page.getByRole('columnheader', { name: 'Historical / Forecast' })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Forecast' }).first()).toBeVisible()

    await page.getByRole('button', { name: 'Show chart view' }).click()
    await expect(page.locator('.recharts-responsive-container')).toBeVisible()
  })

  test('no training or promotion actions appear on the operational Predictions page (§40)', async ({ page }) => {
    await page.goto('/predictions')
    await page.getByRole('heading', { name: 'Patient Flow Forecast' }).waitFor({ timeout: 10000 })

    await expect(page.getByRole('button', { name: 'Train Now' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Promote/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Delete/ })).toHaveCount(0)
  })

  test('one page-level Refresh action re-requests stats, historical, and forecast together', async ({ page }) => {
    await page.goto('/predictions')
    await page.getByRole('heading', { name: 'Patient Flow Forecast' }).waitFor({ timeout: 10000 })

    const [statsRes, histRes, predRes] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/flow-prediction/stats')),
      page.waitForResponse((res) => res.url().includes('/api/flow-prediction/historical')),
      page.waitForResponse((res) => res.url().includes('/api/flow-prediction/predict')),
      page.getByRole('button', { name: 'Refresh' }).click(),
    ])
    expect(statsRes.ok()).toBe(true)
    expect(histRes.ok()).toBe(true)
    expect(predRes.ok()).toBe(true)
  })

  test('Predictions is a real, navigable module in the primary nav', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Predictions' }).click()
    await expect(page).toHaveURL(/\/predictions$/)
    await expect(page.getByRole('heading', { name: 'Predictions', exact: true })).toBeVisible()
  })

  test('no console errors while loading the page', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/predictions')
    await page.getByRole('heading', { name: 'Patient Flow Forecast' }).waitFor({ timeout: 10000 })
    await page.waitForTimeout(500)

    expect(errors).toEqual([])
  })
})
