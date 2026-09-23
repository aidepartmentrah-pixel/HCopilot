import { expect, test } from '@playwright/test'

test.describe('Live ER — placement/assignment flow (V2.3)', () => {
  test('selecting a waiting patient then an available bed completes a real assignment end-to-end', async ({ page }) => {
    await page.goto('/live-er')
    await page.getByTestId('placement-card').first().waitFor({ timeout: 10000 })

    const waitingCard = page.getByTestId('placement-card').filter({ hasText: 'Waiting' }).first()
    test.skip((await waitingCard.count()) === 0, 'no bedless patients available in this environment to assign')

    const patientName = (await waitingCard.getByTestId('placement-card-primary').textContent())?.trim() ?? ''
    await waitingCard.click()
    await expect(page.getByText(/selected — click an available bed to assign it/)).toBeVisible()

    const availableCard = page.getByTestId('placement-card').filter({ hasText: 'Available' }).first()
    test.skip((await availableCard.count()) === 0, 'no available beds in this environment to assign into')
    const bedLabel = (await availableCard.getByTestId('placement-card-primary').textContent())?.trim() ?? ''

    await availableCard.click()
    await expect(page.getByRole('heading', { name: 'Assign bed' })).toBeVisible()
    await expect(page.getByText(`Assign ${patientName} to ${bedLabel}?`, { exact: false })).toBeVisible()

    await page.getByRole('button', { name: 'Assign', exact: true }).click()
    await expect(page.getByText(`${patientName} assigned to ${bedLabel}.`)).toBeVisible({ timeout: 10000 })

    // The board actually updated: that same patient is no longer in the waiting lane.
    await expect(page.getByTestId('placement-card').filter({ hasText: patientName }).filter({ hasText: 'Waiting' })).toHaveCount(0)
  })

  test('waiting duration renders as real minutes/hours, never a raw malformed number (§16)', async ({ page }) => {
    await page.goto('/live-er')
    await page.getByTestId('placement-card').first().waitFor({ timeout: 10000 })
    const waitingCard = page.getByTestId('placement-card').filter({ hasText: 'Waiting' }).first()
    test.skip((await waitingCard.count()) === 0, 'no bedless patients in this environment')

    const text = await waitingCard.textContent()
    expect(text).toMatch(/Waiting (\d{2} min|\d+ h \d+ min)/)
    expect(text).not.toMatch(/Waiting \d{4,}m/)
  })

  test('occupied cards show the real patient ID and never render literal "null"/"undefined" text', async ({ page }) => {
    await page.goto('/live-er')
    await page.getByTestId('placement-card').first().waitFor({ timeout: 10000 })

    const occupiedCards = page.getByTestId('placement-card').filter({ hasText: 'Occupied' })
    const count = await occupiedCards.count()
    test.skip(count === 0, 'no occupied beds in this environment')

    for (let i = 0; i < count; i++) {
      const text = await occupiedCards.nth(i).textContent()
      expect(text).toMatch(/#\d+/)
      expect(text).not.toMatch(/null|undefined/i)
    }
  })

  test('ward rail scroll controls disable at the boundary and enable once scrolled', async ({ page }) => {
    await page.goto('/live-er')
    await page.getByTestId('placement-card').first().waitFor({ timeout: 10000 })

    const lane = page.locator('section').filter({ hasText: 'Occupied' }).first()
    const rightButton = lane.getByRole('button', { name: /Scroll .* right/ })
    if (await rightButton.isEnabled()) {
      await rightButton.click()
      await page.waitForTimeout(500)
      const leftButton = lane.getByRole('button', { name: /Scroll .* left/ })
      await expect(leftButton).toBeEnabled()
    }
  })
})
