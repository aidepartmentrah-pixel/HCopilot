import { expect, test } from '@playwright/test'

test.describe('Statistics', () => {
  test('KPI row, ISBAR alerts panel, and chart grid all render with real data', async ({ page }) => {
    await page.goto('/statistics')

    await expect(page.getByRole('heading', { name: 'Statistics', exact: true })).toBeVisible()

    await expect(page.getByText('Active Patients')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Avg. Wait to Bed')).toBeVisible()
    await expect(page.getByText('Occupancy')).toBeVisible()

    await expect(page.getByText(/Aggregates from ISBAR nursing documentation/)).toBeVisible()
    await expect(page.getByText('Most Reported Concerns')).toBeVisible()
    await expect(page.getByText('Safety Risks Documented')).toBeVisible()

    for (const title of ['Wait Time Distribution', 'Length of Stay', 'Acuity Breakdown', 'Arrivals by Day of Week', 'Top Complaints']) {
      await expect(page.getByRole('heading', { name: title })).toBeVisible()
    }
  })

  test('no console errors while loading the page', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/statistics')
    await page.getByText('Active Patients').waitFor({ timeout: 10000 })
    await page.waitForTimeout(500)

    expect(errors).toEqual([])
  })
})
