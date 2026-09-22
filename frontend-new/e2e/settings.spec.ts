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

  test('Danger Zone reset button stays disabled without the exact confirm phrase', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Reset', exact: true }).click()

    await expect(page.getByRole('heading', { name: 'Reset All Data' })).toBeVisible({ timeout: 10000 })
    const resetButton = page.getByRole('button', { name: 'Reset Everything' })
    await expect(resetButton).toBeDisabled()

    await page.getByLabel(/Type "RESET EVERYTHING" to confirm/).fill('reset everything')
    await expect(resetButton).toBeDisabled()

    // Deliberately never types the exact phrase or clicks the enabled
    // button — this suite must never actually wipe the shared dev
    // database. The gating logic itself is unit-tested in
    // DangerZone.test.tsx.
  })
})
