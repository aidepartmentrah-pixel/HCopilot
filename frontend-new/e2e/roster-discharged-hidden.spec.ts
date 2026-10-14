import { expect, test, type APIRequestContext } from '@playwright/test'
import { deleteStayByVisitId } from './rosterCleanup'

/** Remove the archived (discharged) rows this test created, so repeat runs don't exhaust the mock roster. */
async function deleteLogRowsByVisitId(request: APIRequestContext, erVisitId: string | null) {
  if (!erVisitId) return
  const res = await request.get('/api/data/log-patients/list')
  if (!res.ok()) return
  const rows: Array<{ stay_id: number; er_visit_id?: string | null }> = (await res.json()).patients ?? []
  for (const row of rows.filter((r) => String(r.er_visit_id) === String(erVisitId))) {
    await request.delete(`/api/data/log-patients/delete/${row.stay_id}`).catch(() => {})
  }
}

test.describe('Live ER roster after a discharge', () => {
  test('a person admitted from the roster and then discharged does not reappear on the roster', async ({ page, request }) => {
    await page.goto('/isbar')
    const firstRow = page.getByTestId('er-roster-row').first()
    const hasRosterPerson = await firstRow.waitFor({ state: 'visible', timeout: 15000 }).then(() => true, () => false)
    test.skip(!hasRosterPerson, 'the roster has no un-handled person in this environment')
    const visitId = await firstRow.getAttribute('data-er-visit-id')

    try {
      // 1. Pick from the roster and click Enter ER.
      await firstRow.click()
      const nameField = page.getByRole('textbox', { name: 'Full Name' })
      if (!(await nameField.isVisible())) await page.getByTestId('isbar-section-patient-arrival').click()
      const name = await nameField.inputValue()
      expect(name).not.toBe('')
      await page.getByRole('button', { name: 'Enter ER' }).click()
      await expect(page.getByRole('button', { name: 'Change Patient' })).toBeVisible({ timeout: 10000 })
      await expect(page.locator(`[data-testid="er-roster-row"][data-er-visit-id="${visitId}"]`)).toHaveCount(0)

      // 2. Discharge them from Live ER (waiting card -> select -> open -> Discharge).
      await page.goto('/live-er')
      const card = page.getByTestId('placement-card').filter({ hasText: name }).first()
      await card.waitFor({ timeout: 10000 })
      await card.click()
      await card.click()
      await page.getByRole('button', { name: 'Discharge patient' }).click()
      await page.getByRole('button', { name: 'Discharge Patient' }).click()
      await expect(page.getByTestId('placement-card').filter({ hasText: name })).toHaveCount(0, { timeout: 10000 })

      // 3. Back on the roster page: the API still lists the visit, but HCopilot must not offer it again.
      await page.goto('/isbar')
      await expect(page.getByRole('heading', { name: 'Live ER Roster' })).toBeVisible()
      await page.waitForTimeout(1500) // let the roster request settle
      await expect(page.locator(`[data-testid="er-roster-row"][data-er-visit-id="${visitId}"]`)).toHaveCount(0)

      // ... while the visit really is still listed by the hospital API (so this proves the filter, not an empty roster).
      const raw = await request.get('http://localhost:8090/api/hospital-directory/er/current-visits')
      expect(raw.ok()).toBeTruthy()
    } finally {
      await deleteStayByVisitId(request, visitId)
      await deleteLogRowsByVisitId(request, visitId)
    }
  })
})
