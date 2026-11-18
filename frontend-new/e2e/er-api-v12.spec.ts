import { execFileSync } from 'node:child_process'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { deleteStayByVisitId } from './rosterCleanup'

/**
 * ER roster against 3iSoft's SEPARATE ER API (v1.2, delivered 18 Nov 2026):
 * its own base URL and its own key, configured in Settings → Integrations →
 * "ER API · Live ER Roster". Runs against the v1.2 mock on port 6001.
 *
 * E2E_ER_BASE_URL / E2E_DIR_BASE_URL override the mock URLs (use
 * host.docker.internal when the backend runs in Docker). The departure test
 * also needs E2E_MOCK_PG_CONTAINER (default mock-v12-dev-postgres-1) and
 * waits for the backend's 2-minute er_sync poll.
 */
const ER_BASE_URL = process.env.E2E_ER_BASE_URL ?? 'http://localhost:6001/his-er/api/er/v1'
const DIR_BASE_URL = process.env.E2E_DIR_BASE_URL ?? 'http://localhost:6001/his-general/api/directory/v1'
const MOCK_KEY = process.env.E2E_ER_API_KEY ?? 'dev-secret-key'
const MOCK_PG = process.env.E2E_MOCK_PG_CONTAINER ?? 'mock-v12-dev-postgres-1'
const BACKEND = process.env.VITE_DEV_PROXY_TARGET ?? 'http://localhost:8090'
const ROSTER = '**/api/hospital-directory/er/current-visits'
const ARABIC = /[؀-ۿ]/

async function openIntegrations(page: Page) {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Integrations' }).click()
  await expect(page.getByRole('heading', { name: 'ER API · Live ER Roster' })).toBeVisible({ timeout: 10000 })
}

/** Type a new ER key, replacing the stored one if there is one. */
async function enterErKey(page: Page, key: string) {
  const replace = page.getByRole('heading', { name: 'ER API · Live ER Roster' }).locator('..').getByRole('button', { name: 'Replace Key' })
  if (await replace.isVisible()) await replace.click()
  await page.getByLabel('ER API Key').fill(key)
}

async function saveEr(page: Page) {
  await page.getByRole('button', { name: 'Save ER Settings' }).click()
  await expect(page.getByText('ER API settings saved.')).toBeVisible({ timeout: 10000 })
}

/** Restore the ER settings this file relies on (mock URL + key, switch on) through the API. */
async function restoreErSettings(request: APIRequestContext) {
  await request.post(`${BACKEND}/api/hospital-directory/config/er-roster/save`, { data: { er_base_url: ER_BASE_URL, er_api_key: MOCK_KEY } })
  await request.post(`${BACKEND}/api/hospital-directory/config/er-roster/enable`, { data: { enabled: true } })
}

function psql(sql: string) {
  execFileSync('docker', ['exec', MOCK_PG, 'psql', '-U', 'hospital', '-d', 'hospital_directory', '-c', sql], { stdio: 'pipe' })
}

test.describe('ER API v1.2 — settings', () => {
  test.afterAll(async ({ request }) => restoreErSettings(request))

  test('Directory and ER API are saved separately, and Test ER Roster lists the mock\'s 18 patients', async ({ page }) => {
    await openIntegrations(page)

    // Directory connection (unchanged settings).
    await page.locator('#hd-base-url').fill(DIR_BASE_URL)
    const dirReplace = page.getByRole('button', { name: 'Replace Key' }).first()
    if (await page.locator('#hd-api-key').isHidden()) await dirReplace.click()
    await page.locator('#hd-api-key').fill(MOCK_KEY)
    await page.getByRole('button', { name: 'Save Changes' }).click()
    await expect(page.getByText('Hospital Directory settings saved.')).toBeVisible({ timeout: 10000 })

    // ER API — its own URL and its own key.
    await page.getByLabel('ER API Base URL').fill(ER_BASE_URL)
    await enterErKey(page, MOCK_KEY)
    await saveEr(page)
    await expect(page.getByLabel('ER API Base URL')).toHaveValue(ER_BASE_URL)
    await expect(page.locator('#hd-base-url')).toHaveValue(DIR_BASE_URL) // saving ER never touched the Directory URL

    await page.getByRole('button', { name: 'Test ER Roster' }).click()
    await expect(page.getByTestId('er-roster-test-result')).toContainText('18 patient(s) currently listed', { timeout: 15000 })

    // Enable the switch (no-op if already on) and confirm it sticks.
    const on = page.getByRole('radio', { name: 'On' })
    if ((await on.getAttribute('aria-checked')) !== 'true') {
      await on.click()
      await expect(page.getByText('Live ER roster enabled.')).toBeVisible({ timeout: 15000 })
    }
    await expect(on).toHaveAttribute('aria-checked', 'true')
  })

  test('a wrong ER key gives a clear "API key rejected" message, not an empty roster', async ({ page }) => {
    await openIntegrations(page)
    await enterErKey(page, 'not-the-er-key')
    await saveEr(page)
    await page.getByRole('button', { name: 'Test ER Roster' }).click()
    await expect(page.getByTestId('er-roster-test-result')).toContainText('ER API key rejected', { timeout: 15000 })

    await page.goto('/isbar')
    await expect(page.getByText(/ER API key rejected/)).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('No patients on the roster')).toHaveCount(0)
  })

  test('the ER base URL left on the Directory (old /er/current-visits path) is reported as not found', async ({ page }) => {
    await openIntegrations(page)
    await page.getByLabel('ER API Base URL').fill(DIR_BASE_URL)
    await enterErKey(page, MOCK_KEY)
    await saveEr(page)
    await page.getByRole('button', { name: 'Test ER Roster' }).click()
    await expect(page.getByTestId('er-roster-test-result')).toContainText('/his-er/api/er/v1', { timeout: 15000 })
  })
})

test.describe('ER API v1.2 — Live ER roster', () => {
  test.beforeAll(async ({ request }) => restoreErSettings(request))

  test('shows Arabic names, a readable gender and complaints from the real mock', async ({ page }) => {
    await page.goto('/isbar')
    await expect(page.getByRole('heading', { name: 'Live ER Roster' })).toBeVisible({ timeout: 15000 })
    const rows = page.getByTestId('er-roster-row')
    await rows.first().waitFor({ timeout: 15000 })
    const texts = await rows.allInnerTexts()
    expect(texts.length).toBeGreaterThan(0)
    expect(texts.some((t) => ARABIC.test(t))).toBe(true)
    expect(texts.some((t) => / · (Male|Female)/.test(t))).toBe(true)
    // The old bug printed the first Arabic letter of the gender right after the age (e.g. "48ذ").
    expect(texts.some((t) => /\d[؀-ۿ]/.test(t.split('\n').slice(-1)[0]))).toBe(false)
    await page.screenshot({ path: 'test-results/er-api-v12-roster.png', fullPage: true })
  })

  test('null names show a placeholder, and picking leaves the name blank for the nurse', async ({ page }) => {
    await page.route(ROSTER, (route) =>
      route.fulfill({
        json: {
          success: true,
          status: 'ok',
          total: 1,
          items: [{ er_visit_id: 'E2E-NULL-1', first_name: null, father_name: null, last_name: null, arrival_time: null,
                    arrival_time_raw: null, gender: null, gender_raw: 'X9', age: null, chief_complaint: null }],
        },
      }),
    )
    await page.goto('/isbar')
    const row = page.locator('[data-testid="er-roster-row"][data-er-visit-id="E2E-NULL-1"]')
    await expect(row).toContainText('Unnamed patient', { timeout: 15000 })
    await row.click()
    const nameField = page.getByRole('textbox', { name: 'Full Name' })
    if (!(await nameField.isVisible())) await page.getByTestId('isbar-section-patient-arrival').click()
    await expect(nameField).toHaveValue('')
  })

  test('departure detection end to end: a visit removed from the ER API is auto-discharged on the next poll', async ({ page, request }) => {
    test.setTimeout(240_000)
    const visitId = '77001'
    try {
      psql(`DELETE FROM er_visits WHERE er_visit_id = '${visitId}'`)
      psql(
        `INSERT INTO er_visits (er_visit_id, first_name, father_name, last_name, arrival_time, gender, age, chief_complaint) ` +
          `VALUES ('${visitId}', 'تجربة', 'اختبار', 'مغادرة', now(), 'ذكر', 30, 'فحص المغادرة')`,
      )
    } catch (e) {
      test.skip(true, `mock database container ${MOCK_PG} not reachable: ${e}`)
    }
    try {
      // 1. It appears on the roster.
      await page.goto('/isbar')
      const row = page.locator(`[data-testid="er-roster-row"][data-er-visit-id="${visitId}"]`)
      await expect(row).toBeVisible({ timeout: 20000 })
      await expect(row).toContainText('تجربة اختبار مغادرة')
      await expect(row).toContainText('30 y · Male · فحص المغادرة')

      // 2. Pick it and Enter ER -> an active stay carrying er_visit_id 77001.
      await row.click()
      await page.getByRole('button', { name: 'Enter ER' }).click()
      await expect(page.getByRole('button', { name: 'Change Patient' })).toBeVisible({ timeout: 10000 })
      const active = async () => {
        const body = await (await request.get(`${BACKEND}/api/patients/list`)).json()
        const rows: Array<{ er_visit_id?: string | null }> = Array.isArray(body) ? body : body.patients ?? []
        return rows.some((r) => String(r.er_visit_id) === visitId)
      }
      expect(await active()).toBe(true)

      // 3. Remove it from the ER API; the next er_sync poll (every 2 min) must discharge it as api_detected.
      psql(`DELETE FROM er_visits WHERE er_visit_id = '${visitId}'`)
      await expect.poll(active, { timeout: 180_000, intervals: [5000] }).toBe(false)
      const log = await (await request.get(`${BACKEND}/api/data/log-patients/list`)).json()
      const archived = (log.patients ?? []).filter((r: { er_visit_id?: string | null }) => String(r.er_visit_id) === visitId)
      expect(archived.length).toBeGreaterThan(0)
      expect(archived[archived.length - 1].departure_source).toBe('api_detected')
    } finally {
      try { psql(`DELETE FROM er_visits WHERE er_visit_id = '${visitId}'`) } catch { /* already gone */ }
      await deleteStayByVisitId(request, visitId)
      const log = await (await request.get(`${BACKEND}/api/data/log-patients/list`)).json().catch(() => ({ patients: [] }))
      for (const r of (log.patients ?? []).filter((x: { er_visit_id?: string | null }) => String(x.er_visit_id) === visitId)) {
        await request.delete(`${BACKEND}/api/data/log-patients/delete/${r.stay_id}`).catch(() => {})
      }
    }
  })
})
