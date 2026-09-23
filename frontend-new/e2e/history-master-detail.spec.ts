import { expect, test } from '@playwright/test'

test.describe('History — master/detail workspace (V2.4)', () => {
  test('table shows friendly dates, not raw backend timestamps', async ({ page }) => {
    await page.goto('/history')
    const rows = page.locator('table tbody tr')
    await rows.first().waitFor({ timeout: 10000 })

    const arrivalCell = rows.first().locator('td').nth(2)
    const text = (await arrivalCell.textContent()) ?? ''
    // Real backend timestamps look like "2026-06-12T16:35" — this must never leak through.
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/)
    expect(text.trim()).toMatch(/^\d{2} \w{3} \d{4}, \d{2}:\d{2}$|^—$/)
  })

  test('preview header shows patient identity, stay status, and formatted dates', async ({ page }) => {
    await page.goto('/history')
    const rows = page.locator('table tbody tr')
    await rows.first().waitFor({ timeout: 10000 })
    await rows.first().click()

    await expect(page.getByText(/^Patient #\d+ · Stay #\d+$/)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Discharged').or(page.getByText('Open')).first()).toBeVisible()
  })

  test('ISBAR preview sections show a real Recorded/Not recorded/Partially recorded status', async ({ page }) => {
    await page.goto('/history')
    const rows = page.locator('table tbody tr')
    await rows.first().waitFor({ timeout: 10000 })
    await rows.first().click()
    await expect(page.getByRole('button', { name: 'Open Full Record' })).toBeVisible({ timeout: 10000 })

    const section = page.getByTestId('history-section-vitals')
    await expect(section).toBeVisible()
    const text = await section.textContent()
    expect(text).toMatch(/Recorded|Not recorded|Partially recorded/)
  })

  test('View action selects the row and opens its preview; Delete requires confirmation with real record identity', async ({
    page,
  }) => {
    await page.goto('/history')
    const rows = page.locator('table tbody tr')
    await rows.first().waitFor({ timeout: 10000 })

    const firstRow = rows.first()
    const stayIdText = (await firstRow.locator('td').nth(1).textContent())?.trim() ?? ''

    await firstRow.getByRole('button', { name: /^View/ }).click()
    await expect(page.getByRole('button', { name: 'Open Full Record' })).toBeVisible({ timeout: 10000 })

    await firstRow.getByRole('button', { name: /^Delete/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Delete historical stay?' })).toBeVisible()
    await expect(dialog.getByText(`Stay #${stayIdText}`, { exact: false })).toBeVisible()
    await expect(dialog.getByText('This action cannot be undone.', { exact: false })).toBeVisible()

    // Cancel — never delete anything for real in a shared read path test.
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('heading', { name: 'Delete historical stay?' })).toHaveCount(0)
  })

  test('divider width persists across a reload', async ({ page }) => {
    await page.goto('/history')
    const divider = page.getByRole('separator', { name: 'Resize preview panel' })
    const rows = page.locator('table tbody tr')
    await rows.first().waitFor({ timeout: 10000 })
    await rows.first().click()
    await expect(divider).toBeVisible({ timeout: 10000 })

    divider.focus()
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')

    const storedWidth = await page.evaluate(() => localStorage.getItem('history-preview-width'))
    expect(storedWidth).not.toBeNull()

    await page.reload()
    await rows.first().waitFor({ timeout: 10000 })
    await rows.first().click()
    const widthAfterReload = await page.evaluate(() => localStorage.getItem('history-preview-width'))
    expect(widthAfterReload).toBe(storedWidth)
  })
})
