import { expect, test } from '@playwright/test'

test.describe('Settings', () => {
  test('sidebar navigates between resource tables, each rendering real data', async ({ page }) => {
    await page.goto('/settings')

    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Beds' })).toBeVisible({ timeout: 10000 })
    await expect(page.locator('table')).toBeVisible()

    await page.getByRole('button', { name: 'Wards' }).click()
    await expect(page.getByRole('heading', { name: 'Wards' })).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: 'Doctors' }).click()
    await expect(page.getByRole('heading', { name: 'Doctors' })).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: 'Nurses' }).click()
    await expect(page.getByRole('heading', { name: 'Nurses' })).toBeVisible({ timeout: 10000 })
  })

  test('adding a ward creates it and it appears in the table', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Wards' }).click()
    await page.locator('table').waitFor({ timeout: 10000 })

    const wardName = `E2E Ward ${Date.now()}`
    await page.getByRole('button', { name: 'Add Ward' }).click()
    await page.getByRole('textbox', { name: 'Ward Name' }).fill(wardName)
    await page.getByRole('spinbutton', { name: 'Department ID' }).fill('1')
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()

    await expect(page.getByRole('cell', { name: wardName, exact: true })).toBeVisible({ timeout: 10000 })
  })

  test('editing a ward via row click updates it', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Wards' }).click()
    await page.locator('table').waitFor({ timeout: 10000 })

    const wardName = `E2E Edit Ward ${Date.now()}`
    await page.getByRole('button', { name: 'Add Ward' }).click()
    await page.getByRole('textbox', { name: 'Ward Name' }).fill(wardName)
    await page.getByRole('spinbutton', { name: 'Department ID' }).fill('2')
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('cell', { name: wardName, exact: true })).toBeVisible({ timeout: 10000 })

    const renamedWard = `${wardName} Renamed`
    await page.getByRole('cell', { name: wardName, exact: true }).click()
    const nameInput = page.getByRole('textbox', { name: 'Ward Name' })
    await nameInput.fill(renamedWard)
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()

    await expect(page.getByRole('cell', { name: renamedWard, exact: true })).toBeVisible({ timeout: 10000 })
  })

  test('deleting a ward removes it after confirmation', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Wards' }).click()
    await page.locator('table').waitFor({ timeout: 10000 })

    const wardName = `E2E Delete Ward ${Date.now()}`
    await page.getByRole('button', { name: 'Add Ward' }).click()
    await page.getByRole('textbox', { name: 'Ward Name' }).fill(wardName)
    await page.getByRole('spinbutton', { name: 'Department ID' }).fill('3')
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('cell', { name: wardName, exact: true })).toBeVisible({ timeout: 10000 })

    const row = page.locator('tr', { has: page.getByRole('cell', { name: wardName, exact: true }) })
    await row.getByRole('button', { name: `Delete ${wardName}` }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete Ward', exact: true }).click()

    await expect(page.getByRole('cell', { name: wardName, exact: true })).not.toBeVisible({ timeout: 10000 })
  })

  test('Reset has been completely removed — no nav item, no Danger Zone group, no button anywhere on the page (V2.6, spec §3/§38)', async ({
    page,
  }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Beds' })).toBeVisible({ timeout: 10000 })

    await expect(page.getByText('Danger Zone')).not.toBeVisible()
    await expect(page.getByRole('button', { name: /^Reset/ })).not.toBeVisible()
    await expect(page.getByText(/reset everything/i)).not.toBeVisible()
  })

  test('the compact Administrative Settings notice is visible instead of a permanent oversized banner (§4)', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByText(/Administrative Settings/)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/changes made here may affect live HCopilot operation/i)).toBeVisible()
  })

  test('Integrations shows the real, already-configured Hospital Directory connection', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Integrations' }).click()

    await expect(page.getByRole('heading', { name: 'Hospital Directory' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Connection Status')).toBeVisible()
    await expect(page.getByText('Connected').or(page.getByText('Unavailable')).or(page.getByText('Unknown')).first()).toBeVisible()
    await expect(page.getByText(/Current credential configured/)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Patient Matching' })).toBeVisible()
    await expect(page.getByText(/ER Current Visits.*uses this same connection/)).toBeVisible()
  })

  test('AI & Models shows the live model in Model Registry and real run history with faithful metrics in Training', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'AI & Models' }).click()

    await expect(page.getByRole('heading', { name: 'Flow Prediction Model' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Live', { exact: true })).toBeVisible()

    await page.getByRole('tab', { name: 'Training' }).click()
    await expect(page.getByRole('heading', { name: 'Currently Live Model' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('heading', { name: 'Training Run History' })).toBeVisible()

    const table = page.locator('table')
    await table.waitFor({ timeout: 10000 })
    await expect(page.getByRole('cell', { name: 'Completed' }).first()).toBeVisible()

    // The live run's Promote action must be disabled — never offered on an already-live run (§26).
    const liveRow = page.locator('tr', { has: page.getByText('Live', { exact: true }) })
    await expect(liveRow.getByRole('button', { name: /^Promote/ })).toBeDisabled()
    await expect(liveRow.getByRole('button', { name: /^Delete/ })).toBeDisabled()
  })

  test('Train Now requires confirmation before starting a real training run', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'AI & Models' }).click()
    await page.getByRole('tab', { name: 'Training' }).click()
    await page.getByRole('heading', { name: 'Currently Live Model' }).waitFor({ timeout: 10000 })

    await page.getByRole('button', { name: 'Train Now' }).click()
    await expect(page.getByRole('heading', { name: 'Train a new model now?' })).toBeVisible()
    // Cancel — this suite must not kick off a real multi-second training
    // run against the shared dev backend on every test run.
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('heading', { name: 'Train a new model now?' })).toHaveCount(0)
  })

  test('Accounts & Permissions lists real users, and a new user can be added and removed', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Accounts & Permissions' }).click()

    await expect(page.getByText('@admin')).toBeVisible({ timeout: 10000 })
    const adminRow = page.locator('tr', { has: page.getByText('@admin') })
    await expect(adminRow.getByText('ADMIN', { exact: true })).toBeVisible()

    const username = `e2e_user_${Date.now()}`
    await page.getByRole('button', { name: 'Add User' }).click()
    await page.getByRole('dialog').getByLabel(/^Username/).fill(username)
    await page.getByRole('dialog').getByLabel(/^Password/).fill('e2e-test-password-123')
    await page.getByRole('checkbox', { name: 'Statistics' }).check()
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()

    await expect(page.getByText(`@${username}`)).toBeVisible({ timeout: 10000 })

    const row = page.locator('table tbody tr', { has: page.getByText(`@${username}`) })
    await row.getByRole('button', { name: `Delete ${username}` }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete Account' }).click()
    await expect(row).toHaveCount(0, { timeout: 10000 })
  })

  test('switching a new user\'s role to Admin grants and locks every permission checkbox', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Accounts & Permissions' }).click()
    await page.getByRole('button', { name: 'Add User' }).click()
    await page.getByRole('dialog').waitFor({ timeout: 10000 })

    await expect(page.getByRole('checkbox', { name: 'Home' })).not.toBeChecked()
    await page.getByRole('radio', { name: 'Admin' }).click()
    await expect(page.getByRole('checkbox', { name: 'Home' })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Home' })).toBeDisabled()

    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
  })
})
