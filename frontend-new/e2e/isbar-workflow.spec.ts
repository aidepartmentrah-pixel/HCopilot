import { expect, test } from '@playwright/test'

async function startManualDraft(page: import('@playwright/test').Page) {
  await page.goto('/isbar')
  await page.getByRole('button', { name: "Can't find the patient?" }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Enter Manually', exact: true }).click()
}

test.describe('ER ISBAR Entry — workflow scaffolding (V2.2a)', () => {
  test('section 1 starts active; Continue blocks on missing required fields, then advances once valid', async ({ page }) => {
    await startManualDraft(page)

    const section1 = page.getByTestId('isbar-section-patient-arrival')
    await expect(section1).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Full Name' })).toBeVisible()

    // Blocked: required fields (gender/age/chief complaint/acuity for manual entry) are empty.
    await page.getByTestId('isbar-continue-patient-arrival').click()
    await expect(section1.locator('..').getByText('Missing required fields')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Full Name' })).toBeVisible() // still open, didn't advance

    // Fill everything the manual-entry path requires, then Continue succeeds.
    await page.getByRole('textbox', { name: 'Full Name' }).fill(`Workflow Test ${Date.now()}`)
    await page.getByLabel('Gender').selectOption('Female')
    await page.getByRole('spinbutton', { name: 'Age' }).fill('40')
    await page.getByRole('textbox', { name: 'Chief Complaint (Triage)' }).fill('Test complaint')
    await page.getByRole('radio', { name: /^3/ }).click()
    await page.getByTestId('isbar-continue-patient-arrival').click()

    // Section 1 collapses (Complete) and section 2 opens automatically.
    await expect(section1.locator('..').getByText('Complete')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Full Name' })).toHaveCount(0)
    await expect(page.getByRole('spinbutton', { name: 'Heart Rate (bpm)' })).toBeVisible()
  })

  test('reopening a completed section and clearing a required field downgrades its status live', async ({ page }) => {
    await startManualDraft(page)
    await page.getByRole('textbox', { name: 'Full Name' }).fill(`Downgrade Test ${Date.now()}`)
    await page.getByLabel('Gender').selectOption('Male')
    await page.getByRole('spinbutton', { name: 'Age' }).fill('55')
    await page.getByRole('textbox', { name: 'Chief Complaint (Triage)' }).fill('Test complaint')
    await page.getByRole('radio', { name: /^2/ }).click()
    await page.getByTestId('isbar-continue-patient-arrival').click()

    const section1 = page.getByTestId('isbar-section-patient-arrival')
    await expect(section1.locator('..').getByText('Complete')).toBeVisible()

    // Reopen the now-collapsed, complete section 1.
    await section1.click()
    const nameField = page.getByRole('textbox', { name: 'Full Name' })
    await expect(nameField).toBeVisible()
    await nameField.fill('')
    await nameField.blur()

    // §30 — a Complete section that becomes invalid on edit downgrades on blur, without a Continue click.
    await expect(section1.locator('..').getByText('Missing required fields')).toBeVisible({ timeout: 10_000 })
  })

  test('Change Patient with unsaved changes shows the confirmation dialog (§38), and each choice behaves correctly', async ({
    page,
  }) => {
    await page.goto('/isbar')
    const firstRow = page.getByTestId('er-roster-row').first()
    await firstRow.waitFor({ state: 'visible', timeout: 15000 })
    await firstRow.click()
    await expect(page.getByRole('button', { name: 'Change Patient' })).toBeVisible({ timeout: 10000 })

    // No unsaved changes yet — Change Patient goes straight through.
    await page.getByRole('button', { name: 'Change Patient' }).click()
    await expect(page.getByText('No patient selected')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Unsaved ISBAR changes' })).toHaveCount(0)

    // Re-select and make a real, unsaved edit this time.
    await firstRow.click()
    await expect(page.getByRole('button', { name: 'Change Patient' })).toBeVisible({ timeout: 10000 })
    const complaintField = page.getByRole('textbox', { name: 'Chief Complaint (Triage)' })
    if (!(await complaintField.isVisible())) {
      await page.getByTestId('isbar-section-patient-arrival').click()
    }
    await complaintField.fill('An unsaved edit for the guard test')

    await page.getByRole('button', { name: 'Change Patient' }).click()
    const dialog = page.getByRole('heading', { name: 'Unsaved ISBAR changes' }).locator('..')
    await expect(dialog).toBeVisible()

    // "Stay Here" cancels — the form is still active with the edit intact.
    await dialog.getByRole('button', { name: 'Stay Here' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Change Patient' })).toBeVisible()

    // Now actually discard.
    await page.getByRole('button', { name: 'Change Patient' }).click()
    await page.getByRole('button', { name: 'Discard Changes' }).click()
    await expect(page.getByText('No patient selected')).toBeVisible()
  })
})
