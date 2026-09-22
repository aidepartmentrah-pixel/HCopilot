import { expect, test } from '@playwright/test'

test.describe('ER ISBAR Entry — clinical controls (V2.2b)', () => {
  test('ESI, units, blood pressure, and pain scale all round-trip through a real save', async ({ page }) => {
    await page.goto('/isbar')
    await page.getByRole('button', { name: "Can't find the patient?" }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Enter Manually', exact: true }).click()

    const uniqueName = `Clinical Controls Test ${Date.now()}`
    await page.getByRole('textbox', { name: 'Full Name' }).fill(uniqueName)
    await page.getByLabel('Gender').selectOption('Female')
    await page.getByRole('spinbutton', { name: 'Age' }).fill('61')
    await page.getByRole('textbox', { name: 'Chief Complaint (Triage)' }).fill('Chest pain')

    // ESIScaleSelector — a real rectangular radio control, not a <select>.
    await page.getByRole('radio', { name: /^1/ }).click()
    await expect(page.getByRole('radio', { name: /^1/ })).toHaveAttribute('aria-checked', 'true')

    await page.getByTestId('isbar-continue-patient-arrival').click()

    // UnitInput — the °C/bpm suffixes stay visible after typing.
    const tempField = page.getByRole('spinbutton', { name: 'Temperature (°C)' })
    await expect(tempField).toBeVisible()
    await tempField.fill('38.2')
    await expect(page.getByText('°C', { exact: true })).toBeVisible()
    await page.getByRole('spinbutton', { name: 'Heart Rate (bpm)' }).fill('102')

    // BloodPressureInput — SBP/DBP as one composite control, separate values.
    await page.getByLabel('Systolic BP (mmHg)').fill('140')
    await page.getByLabel('Diastolic BP (mmHg)').fill('90')

    // PainScaleSelector — visual 0-10 cells, not a text box.
    await page.getByRole('radio', { name: '8' }).click()

    await page.getByRole('button', { name: 'Start ISBAR' }).click()
    await expect(page.getByRole('button', { name: 'Change Patient' })).toBeVisible({ timeout: 10000 })

    // Reload and re-select from Active Patients to confirm this reached the real backend.
    await page.reload()
    await page.getByRole('cell', { name: uniqueName }).click()
    await expect(page.getByRole('button', { name: 'Change Patient' })).toBeVisible({ timeout: 10000 })

    const nameField = page.getByRole('textbox', { name: 'Full Name' })
    if (!(await nameField.isVisible())) {
      await page.getByTestId('isbar-section-patient-arrival').click()
    }
    await expect(page.getByRole('radio', { name: /^1/ })).toHaveAttribute('aria-checked', 'true')

    const reloadedTempField = page.getByRole('spinbutton', { name: 'Temperature (°C)' })
    if (!(await reloadedTempField.isVisible())) {
      await page.getByTestId('isbar-section-vitals').click()
    }
    await expect(reloadedTempField).toHaveValue('38.2')
    await expect(page.getByLabel('Systolic BP (mmHg)')).toHaveValue('140')
    await expect(page.getByLabel('Diastolic BP (mmHg)')).toHaveValue('90')
    await expect(page.getByRole('radio', { name: '8' })).toHaveAttribute('aria-checked', 'true')
  })
})
