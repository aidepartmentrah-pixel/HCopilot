import { expect, test } from '@playwright/test'

test.describe('Live ER Board', () => {
  test('beds and waiting patients render as the same card family, with a summary row', async ({ page }) => {
    await page.goto('/live-er')

    await expect(page.getByRole('heading', { name: 'Live ER', exact: true })).toBeVisible()
    await expect(page.getByText('Occupied').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Available').first()).toBeVisible()
    await expect(page.getByText('Without a bed')).toBeVisible()
    await expect(page.getByText('Waiting > 5 min')).toBeVisible()

    const cards = page.getByTestId('placement-card')
    await expect(cards.first()).toBeVisible({ timeout: 10000 })

    // Every card shares the same rendered width — real dimension check,
    // not just a shared class name (the flexbox min-width bug the old UI
    // redesign found — see NF4's utils.ts comment — is exactly the kind of
    // thing a class-name check alone wouldn't catch).
    const count = await cards.count()
    const widths = new Set<number>()
    for (let i = 0; i < Math.min(count, 8); i++) {
      const box = await cards.nth(i).boundingBox()
      if (box) widths.add(Math.round(box.width))
    }
    expect(widths.size).toBe(1)
  })

  test('clicking an available bed with nothing selected opens the assign dialog, not an immediate assignment; clicking occupied opens the detail dialog with Change bed / Discharge choices', async ({
    page,
  }) => {
    await page.goto('/live-er')
    await page.getByTestId('placement-card').first().waitFor({ timeout: 10000 })

    const availableCard = page.getByTestId('placement-card').filter({ hasText: 'Available' }).first()
    if (await availableCard.count()) {
      await availableCard.click()
      await expect(page.getByRole('heading', { name: /Assign a patient to/ })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Discharge Patient' })).toHaveCount(0)
      await page.keyboard.press('Escape')
    }

    const occupiedCard = page.getByTestId('placement-card').filter({ hasText: 'Occupied' }).first()
    if (await occupiedCard.count()) {
      await occupiedCard.click()
      await expect(page.getByRole('button', { name: 'Change bed' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Edit patient data' })).toBeVisible()
      await page.getByRole('button', { name: 'Discharge patient' }).click()
      await expect(page.getByRole('button', { name: 'Discharge Patient' })).toBeVisible()
      await page.keyboard.press('Escape')
    }
  })

  test('clicking a waiting card selects it; clicking the same card again opens its detail dialog with a discharge action', async ({
    page,
  }) => {
    await page.goto('/live-er')
    await expect(page.getByRole('heading', { name: 'Waiting / No Bed' })).toBeVisible({ timeout: 10000 })

    const waitingCard = page.getByTestId('placement-card').filter({ hasText: 'Waiting' }).first()
    if (await waitingCard.count()) {
      await waitingCard.click()
      await expect(waitingCard).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByText(/selected — click an available bed to assign it/)).toBeVisible()

      await waitingCard.click()
      await expect(page.getByRole('button', { name: 'Assign bed' })).toBeVisible()
      await page.getByRole('button', { name: 'Discharge patient' }).click()
      await expect(page.getByRole('button', { name: 'Discharge Patient' })).toBeVisible()
      await page.keyboard.press('Escape')
    }
  })

  test('the pencil on an occupied bed opens the Edit patient popup (not the ISBAR entry page)', async ({ page }) => {
    await page.goto('/live-er')
    const occupiedCard = page.getByTestId('placement-card').filter({ hasText: 'Occupied' }).first()
    await occupiedCard.waitFor({ timeout: 10000 })
    await occupiedCard.click()
    await page.getByRole('button', { name: 'Edit patient data' }).click()
    await expect(page.getByRole('heading', { name: 'Edit patient data' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save Changes' })).toBeVisible({ timeout: 10000 })
    await expect(page).toHaveURL(/\/live-er$/)
    await page.keyboard.press('Escape')
  })
})
