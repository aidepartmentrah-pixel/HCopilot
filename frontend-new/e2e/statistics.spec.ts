import { expect, test } from '@playwright/test'

test.describe('Statistics', () => {
  test('KPI row, documentation coverage banner, and the full analytics grid render with real data', async ({ page }) => {
    await page.goto('/statistics')

    await expect(page.getByRole('heading', { name: 'Statistics', exact: true })).toBeVisible()
    await expect(page.getByText('Showing: All-time data')).toBeVisible()

    await expect(page.getByText('Active Patients')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Avg. Wait to Bed')).toBeVisible()
    await expect(page.getByText('Occupancy')).toBeVisible()
    await expect(page.getByText(/Documentation coverage/)).toBeVisible()

    for (const title of [
      'Most Reported Concerns',
      'Safety Risks Documented',
      'Wait Time Distribution',
      'Length of Stay Distribution',
      'Acuity Breakdown',
      'Patient Arrivals',
    ]) {
      await expect(page.getByRole('heading', { name: title })).toBeVisible()
    }

    await expect(page.getByRole('heading', { name: 'Additional Analyses' })).toBeVisible()
    for (const title of ['Top Complaints', 'Discharge / Transfer Plan', 'Clinical Status', 'Oxygen Support']) {
      await expect(page.getByRole('heading', { name: title })).toBeVisible()
    }
  })

  test('Acuity Breakdown always shows its compact ESI table alongside the switchable chart', async ({ page }) => {
    await page.goto('/statistics')
    const card = page.getByTestId('analytics-card-acuity-breakdown')
    await card.waitFor({ timeout: 10000 })
    await expect(card.getByRole('columnheader', { name: 'Level' })).toBeVisible()
    await expect(card.getByRole('columnheader', { name: 'Avg Wait' })).toBeVisible()
  })

  test('chart-type switcher changes Wait Time Distribution to an exact-value table', async ({ page }) => {
    await page.goto('/statistics')
    const card = page.getByTestId('analytics-card-wait-time-distribution')
    await card.waitFor({ timeout: 10000 })

    await card.getByRole('button', { name: /Change visualization/ }).click()
    await page.getByRole('menuitem', { name: 'Table' }).click()

    await expect(card.getByRole('columnheader', { name: 'Label' })).toBeVisible()
    await expect(card.getByRole('columnheader', { name: 'Patients' })).toBeVisible()
  })

  test('a chart-view preference persists across a reload', async ({ page }) => {
    await page.goto('/statistics')
    const card = page.getByTestId('analytics-card-wait-time-distribution')
    await card.waitFor({ timeout: 10000 })

    await card.getByRole('button', { name: /Change visualization/ }).click()
    await page.getByRole('menuitem', { name: 'Table' }).click()
    await expect(card.getByRole('columnheader', { name: 'Label' })).toBeVisible()

    const stored = await page.evaluate(() => localStorage.getItem('statistics-wait-time-view'))
    expect(stored).toBe('table')

    await page.reload()
    const reloadedCard = page.getByTestId('analytics-card-wait-time-distribution')
    await reloadedCard.waitFor({ timeout: 10000 })
    await expect(reloadedCard.getByRole('columnheader', { name: 'Label' })).toBeVisible()
  })

  test('Patient Arrivals dimension toggle switches between Hour of Day and Day of Week', async ({ page }) => {
    await page.goto('/statistics')
    const card = page.getByTestId('analytics-card-patient-arrivals')
    await card.waitFor({ timeout: 10000 })

    await expect(card.getByRole('button', { name: 'Day of Week' })).toBeVisible()
    await card.getByRole('button', { name: 'Day of Week' }).click()
    await expect(card.getByRole('button', { name: 'Day of Week' })).toHaveAttribute('aria-pressed', 'true')

    await card.getByRole('button', { name: /Change visualization/ }).click()
    await page.getByRole('menuitem', { name: 'Table' }).click()
    await expect(card.getByRole('cell', { name: 'Mon' })).toBeVisible()
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
