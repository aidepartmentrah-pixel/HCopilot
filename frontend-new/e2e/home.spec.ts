import { expect, test } from '@playwright/test'

test.describe('Home / Dashboard (V2.1)', () => {
  test('welcome panel shows the real signed-in user, never a hardcoded example name', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Administrator', exact: true })).toBeVisible()
    await expect(page.getByText('Dr. Sarah Chen')).toHaveCount(0)
  })

  test('all four KPIs render real numeric/text values, not a loading placeholder', async ({ page }) => {
    await page.goto('/')
    for (const label of ['Active ER Patients', 'Occupied Beds', 'Waiting Without Bed', 'Discharged Today']) {
      const card = page.getByText(label, { exact: true }).locator('..')
      await expect(card).not.toContainText('…', { timeout: 10_000 })
    }
    // Occupied Beds cross-checks against the real backend, not a UI-only assumption.
    const stats: { occupied: number; total_beds: number } = await page.evaluate(() =>
      fetch('/api/beds/stats').then((r) => r.json()),
    )
    await expect(page.getByText(`${stats.occupied} / ${stats.total_beds}`)).toBeVisible()
  })

  test('operational alerts panel is honest — every message is real, not a placeholder', async ({ page }) => {
    await page.goto('/')
    const panel = page.getByTestId('operational-alerts-panel')
    await expect(panel.getByText('Checking operational status…')).toHaveCount(0, { timeout: 10_000 })

    const noAlerts = await panel.getByText('No active alerts.').count()
    if (noAlerts === 0) {
      const items = panel.locator('ul li')
      const count = await items.count()
      expect(count).toBeGreaterThan(0)
      for (const text of await items.allTextContents()) {
        expect(text.trim().length).toBeGreaterThan(0)
      }
    }
  })

  test('quick actions navigate to the correct pages', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /Open Live ER/i }).click()
    await expect(page).toHaveURL(/\/live-er$/)

    await page.goto('/')
    await page.getByRole('link', { name: /New ISBAR Entry/i }).click()
    await expect(page).toHaveURL(/\/isbar$/)
  })

  test('each dashboard panel degrades independently — killing the bed stats endpoint only affects Occupied Beds', async ({
    page,
  }) => {
    await page.route('**/api/beds/stats', (route) => route.fulfill({ status: 500, body: 'Internal Server Error' }))
    await page.goto('/')

    const occupiedBedsCard = page.getByText('Occupied Beds', { exact: true }).locator('..')
    await expect(occupiedBedsCard).toContainText('Unavailable')

    // The other three KPIs still render real data despite the killed endpoint.
    await expect(page.getByText('Active ER Patients', { exact: true }).locator('..')).not.toContainText('Unavailable')
    await expect(page.getByText('Waiting Without Bed', { exact: true }).locator('..')).not.toContainText('Unavailable', {
      timeout: 10_000,
    })
    await expect(page.getByText('Discharged Today', { exact: true }).locator('..')).not.toContainText('Unavailable', {
      timeout: 10_000,
    })

    // System Status also independently reflects the real backend being reachable, unaffected by the killed beds endpoint.
    const systemStatus = page.getByTestId('system-status-panel')
    await expect(systemStatus.getByText('HCopilot Backend', { exact: true })).toBeVisible()
    await expect(systemStatus.getByText('Operational').first()).toBeVisible()
  })
})
