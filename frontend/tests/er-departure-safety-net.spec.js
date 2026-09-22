// tests/er-departure-safety-net.spec.js — full ER Live-Roster Redesign
// loop, end to end (slice ER12).
//
// Covers: pick a name off the live roster → completes via Edit → appears
// in Beds Display's bedless section → assign a bed → discharge → shows in
// History, tagged appropriately. Same roster-availability precondition as
// addition-roster.spec.js — skips rather than fails if no roster item is
// pickable in this environment.
//
// NOT covered here: the actual timed poll-diff auto-discharge
// (reconcile_er_departures(), ~2 min interval — see backend/scheduler.py).
// Waiting out a real interval would make this suite slow and flaky for
// what is fundamentally a backend scheduling concern; it's already
// covered directly and deterministically by
// backend/tests/test_er_redesign.py::test_er_poll_diff_auto_discharges_missing_patient,
// which calls reconcile_er_departures() directly against a mocked roster
// response. This spec proves the UI-visible half of the loop instead.

const { test, expect } = require('@playwright/test');
const { login, gotoPatients, gotoBedsDisplay } = require('./helpers');

const API_BASE = 'http://localhost:8082';

test.describe('ER Live-Roster Redesign — full loop', () => {
  test('roster pick → bedless → bed assign → discharge → History', async ({ page, request }) => {
    await login(page);
    await gotoPatients(page);

    const results = page.locator('#pat-er-roster-results .pat-directory-result-row');
    await page.waitForTimeout(1000);
    const count = await results.count();
    test.skip(count === 0, 'No pickable ER roster item available in this environment.');

    const pickedName = (await results.first().locator('.pat-directory-result-name').textContent()).trim();
    await results.first().click();
    // ER UI Architecture Redesign — the panel activates in place, no modal.
    await expect(page.locator('.pat-a-isbar-panel')).toHaveAttribute('data-mode', 'active', { timeout: 10000 });
    const stayId    = await page.locator('#pat-stay-id').inputValue();
    const patientId = await page.locator('#pat-patient-id').inputValue();

    await page.selectOption('#pat-gender', 'Male');
    await page.fill('#pat-age', '52');
    await page.click('#pat-acuity-scale .pat-scale-btn[data-acuity="4"]');
    await page.fill('#pat-chiefcomplaint', 'PLAYWRIGHT_FULL_LOOP');
    await page.click('#pat-add-btn');
    await expect(page.locator('#message')).toContainText(/updated/i, { timeout: 10000 });

    let bedId = null;
    try {
      // Appears in the bedless section (no bed assigned yet).
      await gotoBedsDisplay(page);
      const bedlessCard = page.locator(`#bedless-card-${patientId}`);
      await expect(bedlessCard).toBeVisible();
      await expect(bedlessCard).toContainText(pickedName);

      // Assign a bed — same real flow a Contour Nurse would use.
      const addBedRes = await request.post(`${API_BASE}/api/beds/add`, {
        data: { bed_number: 'PLAYWRIGHT-LOOP-BED', bed_type: 'normal' },
      });
      bedId = (await addBedRes.json()).bed.bed_id;
      const assignRes = await request.post(`${API_BASE}/api/beds/assign/${bedId}`, {
        data: { patient_id: parseInt(patientId, 10) },
      });
      expect(assignRes.ok()).toBeTruthy();

      // No longer bedless.
      await gotoBedsDisplay(page);
      await expect(page.locator(`#bedless-card-${patientId}`)).toHaveCount(0);

      // Discharge from the bed, then confirm it's in History. Departure
      // must be a real timestamp AFTER the roster's own arrival_time —
      // unlike other specs' manually-entered fixed '2026-01-01' arrivals,
      // this stay's arrival_time came from the live (real-dated) mock
      // roster, so a fixed past constant here would fail
      // validate_discharge_time's arrival <= departure check.
      const departureTime = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16);
      const dischargeRes = await request.post(`${API_BASE}/api/beds/discharge/${bedId}`, {
        data: { departure_time: departureTime, destination: 'Home' },
      });
      expect(dischargeRes.ok()).toBeTruthy();

      const detailsRes = await request.get(`${API_BASE}/api/patients/${stayId}/details`);
      const details = await detailsRes.json();
      expect(details.source).toBe('log');
      expect(details.departure_source).toBe('manual');
    } finally {
      await request.delete(`${API_BASE}/api/data/log-patients/delete/${stayId}`).catch(() => {});
      await request.delete(`${API_BASE}/api/patients/delete/${stayId}`).catch(() => {});
      if (bedId) await request.delete(`${API_BASE}/api/beds/delete/${bedId}`).catch(() => {});
    }
  });
});
