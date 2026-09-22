import { expect, test } from '@playwright/test'

test.describe('Arabic / RTL (§19)', () => {
  test('ER roster renders real Arabic patient names without breaking row layout', async ({ page }) => {
    await page.goto('/isbar')
    const rows = page.getByTestId('er-roster-row')
    await rows.first().waitFor({ timeout: 10000 })

    const count = await rows.count()
    let arabicRowsChecked = 0
    for (let i = 0; i < count; i++) {
      const text = await rows.nth(i).innerText()
      if (/[؀-ۿ]/.test(text)) {
        const box = await rows.nth(i).boundingBox()
        expect(box).not.toBeNull()
        // The row shouldn't overflow its panel — a real width check, not just "text is present".
        expect(box!.width).toBeLessThan(340)
        arabicRowsChecked++
      }
    }
    // This dataset is seeded with real Arabic names (see NF3's own log) —
    // fail loudly if that ever stops being true, rather than silently
    // passing a test that checked nothing.
    expect(arabicRowsChecked).toBeGreaterThan(0)
  })

  test('picking an Arabic-named roster patient renders the name correctly in the identity banner and form', async ({ page }) => {
    await page.goto('/isbar')
    const arabicRow = page.getByTestId('er-roster-row').filter({ hasText: /[؀-ۿ]/ }).first()
    await arabicRow.waitFor({ timeout: 10000 })
    const name = (await arabicRow.locator('span').first().textContent())?.trim() ?? ''

    await arabicRow.click()
    await expect(page.getByRole('button', { name: 'Change Patient' })).toBeVisible({ timeout: 10000 })

    const nameInput = page.getByRole('textbox', { name: 'Full Name' })
    await expect(nameInput).toHaveValue(name)
    await expect(nameInput).toHaveAttribute('dir', 'auto')
  })

  test('History table and preview render Arabic complaint/name content without layout overflow', async ({ page }) => {
    await page.goto('/history')
    await page.locator('table tbody tr').first().waitFor({ timeout: 10000 })

    const rows = page.locator('table tbody tr')
    const count = await rows.count()
    for (let i = 0; i < Math.min(count, 30); i++) {
      const text = await rows.nth(i).innerText()
      if (/[؀-ۿ]/.test(text)) {
        const box = await rows.nth(i).boundingBox()
        const tableBox = await page.locator('table').boundingBox()
        expect(box).not.toBeNull()
        expect(tableBox).not.toBeNull()
        // Row stays within the table's own width — no horizontal blowout from long Arabic text.
        expect(box!.width).toBeLessThanOrEqual(tableBox!.width + 1)
        break
      }
    }
  })
})
