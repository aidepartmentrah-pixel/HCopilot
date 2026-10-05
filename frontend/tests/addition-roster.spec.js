// tests/addition-roster.spec.js - the live ER roster picker on Page A
// (New Patient / ISBAR).
//
// BEHAVIOR (2026-10-01, user decision "create on Add"): picking a roster
// name only FILLS the form - nothing is saved. Clicking Add Patient creates
// the stay (roster-origin, record_source="external", only name + arrival
// required), the person disappears from the not-yet-added roster list, and
// they land on the Live ER waiting (bedless) list for bed assignment.
//
// PRECONDITION: the Hospital Directory API must be configured and reachable
// (Settings > Hospital Directory API, live roster ON). If no roster item is
// available to pick, these tests skip rather than fail - they prove the
// picker's own behavior, not environment uptime.

const { test, expect } = require('@playwright/test');
const { login, gotoPatients } = require('./helpers');

const API_BASE = 'http://localhost:8082';

async function firstRosterRow(page) {
  const results = page.locator('#pat-er-roster-results .pat-directory-result-row');
  // The roster fetch is a separate request kicked off by initPatientForm().
  await page.waitForTimeout(1000);
  const count = await results.count();
  test.skip(count === 0, 'No pickable ER roster item available in this environment - see precondition note above.');
  return results.first();
}

test.describe('Page A - live ER roster picker (create on Add)', () => {
  test('picking only fills the form; Add creates the stay and removes the person from the roster', async ({ page, request }) => {
    await login(page);
    await gotoPatients(page);

    const row = await firstRosterRow(page);
    const erVisitId  = await row.getAttribute('data-er-visit-id');
    const pickedName = (await row.locator('.pat-directory-result-name').textContent()).trim();
    await row.click();

    // Picked, NOT created: the panel is an unsaved draft pre-filled with the name.
    await expect(page.locator('.pat-a-isbar-panel')).toHaveAttribute('data-mode', 'draft');
    await expect(page.locator('#pat-name')).toHaveValue(pickedName);
    await expect(page.locator('.pat-a-roster-row[data-er-visit-id="' + erVisitId + '"] .pat-a-roster-chip')).toContainText(/selected/i);
    await expect(page.locator('#pat-add-btn')).toContainText(/Add Patient/);

    // Add with only name + arrival (gender/age/acuity/chief complaint are optional for roster picks).
    await page.click('#pat-add-btn');
    await expect(page.locator('#message')).toContainText(/added/i, { timeout: 10000 });
    await expect(page.locator('.pat-a-isbar-panel')).toHaveAttribute('data-mode', 'active', { timeout: 10000 });
    const stayId = await page.locator('#pat-stay-id').inputValue();

    try {
      // Gone from the not-yet-added list.
      await expect(page.locator('.pat-a-roster-row[data-er-visit-id="' + erVisitId + '"]')).toHaveCount(0);

      const details = await (await request.get(API_BASE + '/api/patients/' + stayId + '/details')).json();
      expect(details.record_source).toBe('external');
      expect(String(details.er_visit_id)).toBe(String(erVisitId));
    } finally {
      await request.delete(API_BASE + '/api/patients/delete/' + stayId).catch(() => {});
    }
  });

  test('picking without clicking Add creates nothing and leaves the person in the roster', async ({ page, request }) => {
    await login(page);
    await gotoPatients(page);

    const row = await firstRosterRow(page);
    const erVisitId = await row.getAttribute('data-er-visit-id');
    await row.click();
    await expect(page.locator('.pat-a-isbar-panel')).toHaveAttribute('data-mode', 'draft');

    // Cancel the draft (no Add) - confirm any discard prompt.
    page.once('dialog', d => d.accept());
    await page.click('#pat-a-cancel-btn');
    await expect(page.locator('.pat-a-isbar-panel')).toHaveAttribute('data-mode', 'disabled');

    // Still listed, and no stay exists for that visit.
    await expect(page.locator('.pat-a-roster-row[data-er-visit-id="' + erVisitId + '"]')).toHaveCount(1);
    const list = await (await request.get(API_BASE + '/api/patients/list')).json();
    const rows = Array.isArray(list) ? list : (list.patients || list.data || []);
    expect(rows.some(r => String(r.er_visit_id) === String(erVisitId))).toBe(false);
  });

  test('a roster-origin stay can be completed afterwards in the same panel (incremental save)', async ({ page, request }) => {
    // The server's check_required_by_origin re-derives roster-origin from each
    // request's own record_source/er_visit_id - saveActivePatientForm() must
    // keep sending them or this 422s.
    await login(page);
    await gotoPatients(page);

    const row = await firstRosterRow(page);
    await row.click();
    await page.click('#pat-add-btn');
    await expect(page.locator('.pat-a-isbar-panel')).toHaveAttribute('data-mode', 'active', { timeout: 10000 });
    const stayId = await page.locator('#pat-stay-id').inputValue();

    try {
      await page.click('#isbar-details-patient-arrival-add button:has-text("Continue to Vital Signs")');
      await page.fill('#pat-heartrate', '88');
      await page.click('#pat-add-btn');
      await expect(page.locator('#message')).toContainText(/updated/i, { timeout: 10000 });
      await expect(page.locator('#pat-add-error')).toBeHidden();

      const details = await (await request.get(API_BASE + '/api/patients/' + stayId + '/details')).json();
      expect(details.heartrate).toBe(88);
      expect(details.record_source).toBe('external');
    } finally {
      await request.delete(API_BASE + '/api/patients/delete/' + stayId).catch(() => {});
    }
  });
});
