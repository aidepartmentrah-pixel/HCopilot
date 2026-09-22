// tests/addition-roster.spec.js — the live ER roster picker on Page A
// (New Patient / ISBAR), ER Live-Roster Redesign slices ER6/ER9 as
// re-surfaced by the ER UI Architecture Redesign (Page A: no modal —
// picking activates the ISBAR panel in place instead of opening the old
// Edit modal).
//
// PRECONDITION: the Hospital Directory API must be configured (Settings
// > Hospital Directory API) and reachable — in dev this points at the
// v1.2 mock's /er/current-visits (see docs/development/ER Live Roster
// Redesign/0. Slicing Task Table.md). If no roster item is available to
// pick (API unreachable, or every mock item already claimed by an
// earlier run that wasn't cleaned up), this test skips rather than
// fails — it proves the picker's own behavior, not environment uptime.
//
// Picking a roster row creates the stay immediately with only
// name + arrival_time + er_visit_id (record_source="external") — gender/
// age/acuity/chiefcomplaint are deliberately left for the nurse to fill
// in afterward in the same panel. This test proves both halves: the
// relaxed create, and that the panel's own client-side validation was
// relaxed to match (see patActiveIsRosterOrigin in patients.js).

const { test, expect } = require('@playwright/test');
const { login, gotoPatients } = require('./helpers');

const API_BASE = 'http://localhost:8082';

test.describe('Page A — live ER roster picker', () => {
  test('picking a roster name creates the stay immediately with relaxed fields, then completes in place (no modal)', async ({ page, request }) => {
    await login(page);
    await gotoPatients(page);

    const results = page.locator('#pat-er-roster-results .pat-directory-result-row');
    // Give the roster fetch a moment beyond gotoPatients()'s own settle wait —
    // it's a separate request kicked off by initPatientForm().
    await page.waitForTimeout(1000);
    const count = await results.count();
    test.skip(count === 0, 'No pickable ER roster item available in this environment — see precondition note above.');

    const pickedName = (await results.first().locator('.pat-directory-result-name').textContent()).trim();
    await results.first().click();

    // The stay is created and the ISBAR panel activates in place — no modal.
    await expect(page.locator('.pat-a-isbar-panel')).toHaveAttribute('data-mode', 'active', { timeout: 10000 });
    await expect(page.locator('#pat-a-banner')).toBeVisible();
    await expect(page.locator('#pat-a-banner-name')).toContainText(pickedName);
    await expect(page.locator('#pat-name')).toHaveValue(pickedName);
    // Roster-origin relaxed create: acuity is HCopilot's own clinical
    // assessment, never supplied by the ER roster at all (unlike gender/
    // age/chief_complaint, which the mock sometimes does provide and the
    // picker autofills when present) — so it's always blank here,
    // regardless of which mock item got picked.
    await expect(page.locator('#pat-acuity')).toHaveValue('');

    const stayId = await page.locator('#pat-stay-id').inputValue();

    try {
      // Complete the record in the same panel (no modal) — the primary
      // action button reads "Save ISBAR Entry" while a stay is active.
      await page.selectOption('#pat-gender', 'Female');
      await page.fill('#pat-age', '29');
      await page.click('#pat-acuity-scale .pat-scale-btn[data-acuity="3"]');
      await page.fill('#pat-chiefcomplaint', 'PLAYWRIGHT_ROSTER_PICK');
      await page.click('#pat-add-btn');
      await expect(page.locator('#message')).toContainText(/updated/i, { timeout: 10000 });

      const detailsRes = await request.get(`${API_BASE}/api/patients/${stayId}/details`);
      const details = await detailsRes.json();
      expect(details.record_source).toBe('external');
      expect(details.er_visit_id).toBeTruthy();
      expect(details.gender).toBe('Female');
      expect(details.acuity).toBe(3);
    } finally {
      // Delete rather than discharge — this frees the mock roster item
      // (excluded from the pickable list only while an active stay holds
      // its er_visit_id) so repeat runs don't exhaust the mock's fixed set.
      await request.delete(`${API_BASE}/api/patients/delete/${stayId}`).catch(() => {});
    }
  });

  test('saving a roster-origin stay without gender/age/acuity/chiefcomplaint succeeds (incremental save)', async ({ page, request }) => {
    // Real bug found while building this redesign: the server's
    // check_required_by_origin validator re-derives roster-origin from each
    // request's own record_source/er_visit_id — omitting them on save (as
    // the first draft of saveActivePatientForm() did) made this 422 even
    // though the client-side check correctly allowed it.
    await login(page);
    await gotoPatients(page);

    const results = page.locator('#pat-er-roster-results .pat-directory-result-row');
    await page.waitForTimeout(1000);
    const count = await results.count();
    test.skip(count === 0, 'No pickable ER roster item available in this environment — see precondition note above.');

    await results.first().click();
    await expect(page.locator('.pat-a-isbar-panel')).toHaveAttribute('data-mode', 'active', { timeout: 10000 });
    const stayId = await page.locator('#pat-stay-id').inputValue();

    try {
      // Touch only a vital — never fill gender/age/acuity/chiefcomplaint —
      // and save. Must succeed, not 422. Vitals is collapsed by default.
      await page.click('#isbar-details-patient-arrival-add button:has-text("Continue to Vital Signs")');
      await page.fill('#pat-heartrate', '88');
      await page.click('#pat-add-btn');
      await expect(page.locator('#message')).toContainText(/updated/i, { timeout: 10000 });
      await expect(page.locator('#pat-add-error')).toBeHidden();

      const detailsRes = await request.get(`${API_BASE}/api/patients/${stayId}/details`);
      const details = await detailsRes.json();
      expect(details.heartrate).toBe(88);
      expect(details.record_source).toBe('external');
      expect(details.er_visit_id).toBeTruthy();
    } finally {
      await request.delete(`${API_BASE}/api/patients/delete/${stayId}`).catch(() => {});
    }
  });

  test('re-picking an already-added roster entry re-selects it instead of creating a duplicate', async ({ page, request }) => {
    await login(page);
    await gotoPatients(page);

    const results = page.locator('#pat-er-roster-results .pat-directory-result-row');
    await page.waitForTimeout(1000);
    const count = await results.count();
    test.skip(count === 0, 'No pickable ER roster item available in this environment — see precondition note above.');

    // Key off er_visit_id, not the displayed name — the mock roster can
    // contain multiple entries sharing a name, and matching by visible text
    // alone risks re-picking the wrong row.
    const erVisitId = await results.first().getAttribute('data-er-visit-id');
    await results.first().click();
    await expect(page.locator('.pat-a-isbar-panel')).toHaveAttribute('data-mode', 'active', { timeout: 10000 });
    const stayId = await page.locator('#pat-stay-id').inputValue();

    try {
      // Change Patient, then find the same roster entry again — it should
      // now show an "In Progress" chip rather than disappearing or offering
      // to re-create.
      await page.click('.pat-a-banner button:has-text("Change Patient")');
      await expect(page.locator('#pat-a-placeholder')).toBeVisible();
      await page.waitForTimeout(500);

      const sameRow = page.locator(`.pat-a-roster-row[data-er-visit-id="${erVisitId}"]`);
      await expect(sameRow.locator('.pat-a-roster-chip')).toContainText(/in progress/i);
      await sameRow.click();

      await expect(page.locator('.pat-a-isbar-panel')).toHaveAttribute('data-mode', 'active', { timeout: 10000 });
      await expect(page.locator('#pat-stay-id')).toHaveValue(stayId);
    } finally {
      await request.delete(`${API_BASE}/api/patients/delete/${stayId}`).catch(() => {});
    }
  });
});
