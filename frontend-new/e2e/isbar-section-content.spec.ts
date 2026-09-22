import { expect, test } from '@playwright/test'

test.describe('ER ISBAR Entry — section content parity (V2.2c)', () => {
  test('restored tile/segmented fields (Clinical Status, Allergies, Isolation Precautions) persist through a real save and reload', async ({
    page,
  }) => {
    await page.goto('/isbar')
    await page.getByRole('button', { name: "Can't find the patient?" }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Enter Manually', exact: true }).click()

    const uniqueName = `Section Content Test ${Date.now()}`
    await page.getByRole('textbox', { name: 'Full Name' }).fill(uniqueName)
    await page.getByLabel('Gender').selectOption('Female')
    await page.getByRole('spinbutton', { name: 'Age' }).fill('45')
    await page.getByRole('textbox', { name: 'Chief Complaint (Triage)' }).fill('Fever')
    await page.getByRole('radio', { name: /^3/ }).click()
    await page.getByRole('button', { name: 'Start ISBAR' }).click()
    await expect(page.getByRole('button', { name: 'Change Patient' })).toBeVisible({ timeout: 10000 })

    // Situation — Clinical Status is now a visible tile, not a <select>.
    await page.getByTestId('isbar-section-situation').click()
    await page.getByRole('radio', { name: 'Deteriorating' }).click()

    // Background — Allergies is Yes/No/NKA visible choices, and NKA reads as "No known allergies".
    await page.getByTestId('isbar-section-background').click()
    await expect(page.getByRole('radio', { name: 'No known allergies' })).toBeVisible()
    await page.getByRole('radio', { name: 'No known allergies' }).click()
    await page.getByRole('radio', { name: 'Airborne' }).click() // Isolation Precautions tile

    await page.getByRole('button', { name: 'Save Changes' }).click()
    await expect(page.getByText('Changes saved.')).toBeVisible({ timeout: 10000 })

    await page.reload()
    await page.getByRole('cell', { name: uniqueName }).click()
    await expect(page.getByRole('button', { name: 'Change Patient' })).toBeVisible({ timeout: 10000 })

    const situationRadio = page.getByRole('radio', { name: 'Deteriorating' })
    if (!(await situationRadio.isVisible())) {
      await page.getByTestId('isbar-section-situation').click()
    }
    await expect(situationRadio).toHaveAttribute('aria-checked', 'true')

    const allergyRadio = page.getByRole('radio', { name: 'No known allergies' })
    if (!(await allergyRadio.isVisible())) {
      await page.getByTestId('isbar-section-background').click()
    }
    await expect(allergyRadio).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('radio', { name: 'Airborne' })).toHaveAttribute('aria-checked', 'true')
  })
})
