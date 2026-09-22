import { expect, test } from '@playwright/test'

test.describe('ER ISBAR Entry', () => {
  test('form is disabled until a patient is selected, roster loads', async ({ page }) => {
    await page.goto('/isbar')

    await expect(page.getByText('No patient selected')).toBeVisible()
    // Section fields shouldn't even be rendered while disabled (mode==='disabled' renders a preview, not the real form).
    await expect(page.getByRole('textbox', { name: 'Full Name' })).toHaveCount(0)

    await expect(page.getByRole('heading', { name: 'Live ER Roster' })).toBeVisible()
    await expect(page.getByTestId('er-roster-row').first()).toBeVisible({ timeout: 10000 })
  })

  test('picking a roster patient creates the stay and activates the form in place', async ({ page }) => {
    await page.goto('/isbar')

    const firstRow = page.getByTestId('er-roster-row').first()
    await firstRow.waitFor({ state: 'visible', timeout: 15000 })
    const visitId = await firstRow.getAttribute('data-er-visit-id')

    await firstRow.click()

    await expect(page.getByRole('button', { name: 'Change Patient' })).toBeVisible({ timeout: 10000 })
    // Patient & Arrival auto-completes and collapses once a roster patient
    // with a real name loads (V2.2a §9 auto-progression) — reopen it to
    // confirm the field is populated and editable, rather than assuming
    // it's still the open section.
    const nameField = page.getByRole('textbox', { name: 'Full Name' })
    if (!(await nameField.isVisible())) {
      await page.getByTestId('isbar-section-patient-arrival').click()
    }
    await expect(nameField).toBeEnabled()

    // The picked roster entry shows as "Selected", exactly once — not
    // duplicated into a second row.
    const pickedRow = page.locator(`[data-er-visit-id="${visitId}"]`)
    await expect(pickedRow).toHaveCount(1)
    await expect(pickedRow.getByText('Selected')).toBeVisible()
  })

  test('manual entry: filling required fields and submitting creates a new patient', async ({ page }) => {
    await page.goto('/isbar')

    await page.getByRole('button', { name: "Can't find the patient?" }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Enter Manually', exact: true }).click()

    await expect(page.getByRole('textbox', { name: 'Full Name' })).toBeEnabled()

    const uniqueName = `Test Patient ${Date.now()}`
    await page.getByRole('textbox', { name: 'Full Name' }).fill(uniqueName)
    await page.getByLabel('Gender').selectOption('Female')
    await page.getByRole('spinbutton', { name: 'Age' }).fill('34')
    await page.getByRole('textbox', { name: 'Chief Complaint (Triage)' }).fill('Abdominal pain')
    await page.getByRole('radio', { name: /^3/ }).click()

    await page.getByRole('button', { name: 'Start ISBAR' }).click()

    await expect(page.getByRole('button', { name: 'Change Patient' })).toBeVisible({ timeout: 10000 })
    // Patient & Arrival auto-completes and collapses once submitted (§9) — reopen it to confirm the saved value.
    const savedNameField = page.getByRole('textbox', { name: 'Full Name' })
    if (!(await savedNameField.isVisible())) {
      await page.getByTestId('isbar-section-patient-arrival').click()
    }
    await expect(savedNameField).toHaveValue(uniqueName)
  })

  test('Change Patient returns to the disabled state', async ({ page }) => {
    await page.goto('/isbar')
    await page.getByRole('button', { name: "Can't find the patient?" }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Enter Manually', exact: true }).click()

    const uniqueName = `Change Patient Test ${Date.now()}`
    await page.getByRole('textbox', { name: 'Full Name' }).fill(uniqueName)
    await page.getByLabel('Gender').selectOption('Male')
    await page.getByRole('spinbutton', { name: 'Age' }).fill('50')
    await page.getByRole('textbox', { name: 'Chief Complaint (Triage)' }).fill('Chest pain')
    await page.getByRole('radio', { name: /^2/ }).click()
    await page.getByRole('button', { name: 'Start ISBAR' }).click()
    await expect(page.getByRole('button', { name: 'Change Patient' })).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: 'Change Patient' }).click()

    await expect(page.getByText('No patient selected')).toBeVisible()
  })

  test('completing a section persists on save', async ({ page }) => {
    await page.goto('/isbar')
    await page.getByRole('button', { name: "Can't find the patient?" }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Enter Manually', exact: true }).click()

    const uniqueName = `Vitals Test ${Date.now()}`
    await page.getByRole('textbox', { name: 'Full Name' }).fill(uniqueName)
    await page.getByLabel('Gender').selectOption('Male')
    await page.getByRole('spinbutton', { name: 'Age' }).fill('60')
    await page.getByRole('textbox', { name: 'Chief Complaint (Triage)' }).fill('Fall')
    await page.getByRole('radio', { name: /^2/ }).click()
    await page.getByRole('button', { name: 'Start ISBAR' }).click()
    await expect(page.getByRole('button', { name: 'Change Patient' })).toBeVisible({ timeout: 10000 })

    // V2.2a auto-opens the next section once Patient & Arrival is complete
    // (§9) — it may already be open here, so only click to open it if it's
    // still collapsed, rather than assuming a closed starting state.
    const heartRateField = page.getByRole('spinbutton', { name: 'Heart Rate (bpm)' })
    if (!(await heartRateField.isVisible())) {
      await page.getByTestId('isbar-section-vitals').click()
    }
    await heartRateField.fill('88')
    await page.getByRole('button', { name: 'Save Changes' }).click()
    await expect(page.getByText('Changes saved.')).toBeVisible({ timeout: 10000 })

    // Reload clears component state (mode/selection) — re-select the same
    // stay from the Active Patients table below to confirm the save really
    // reached the backend, not just this session's in-memory form state.
    await page.reload()
    await page.getByRole('cell', { name: uniqueName }).click()
    await expect(page.getByRole('button', { name: 'Change Patient' })).toBeVisible({ timeout: 10000 })
    const reloadedHeartRateField = page.getByRole('spinbutton', { name: 'Heart Rate (bpm)' })
    if (!(await reloadedHeartRateField.isVisible())) {
      await page.getByTestId('isbar-section-vitals').click()
    }
    await expect(reloadedHeartRateField).toHaveValue('88')
  })
})
