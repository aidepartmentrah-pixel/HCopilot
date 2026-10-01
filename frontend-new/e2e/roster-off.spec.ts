import { expect, test } from '@playwright/test'

// The admin "Live ER roster" switch ships OFF so HCopilot can run against a
// directory API that predates /er/current-visits. The backend answers
// `roster_off` (not an error) in that state. The response is stubbed here so
// this spec never touches the real switch the other specs depend on.
test.describe('Live ER roster switched off', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/hospital-directory/er/current-visits', (route) =>
      route.fulfill({
        json: { success: false, status: 'roster_off', message: 'Live ER roster is not enabled.', items: [] },
      }),
    )
  })

  test('ISBAR entry shows a neutral note and opens search / manual entry instead of an error', async ({ page }) => {
    await page.goto('/isbar')

    await expect(page.getByTestId('er-roster-off-note')).toContainText('not enabled')
    await expect(page.getByRole('heading', { name: 'Live ER Roster' })).toHaveCount(0)
    await expect(page.getByText('Hospital Directory unavailable')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Search Hospital Directory' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Enter Manually' })).toBeVisible()
  })

  test('Home does not raise a roster alert while the switch is off', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('system-status-panel')).toContainText('ER roster not enabled')
    await expect(page.getByText('ER roster connection unavailable.')).toHaveCount(0)
    await expect(page.getByText('Hospital Directory is temporarily unreachable.')).toHaveCount(0)
  })
})
