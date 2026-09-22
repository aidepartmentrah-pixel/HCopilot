// tests/beds-bedless.spec.js — Beds Display's bedless section
// (ER Live-Roster Redesign, slice ER8).
//
// Test data seeded directly via the backend API (same convention as
// patient-details.spec.js) — this spec is about the bedless section's
// rendering/discharge behavior, not the entry form itself.

const { test, expect } = require('@playwright/test');
const { login, gotoBedsDisplay } = require('./helpers');

const API_BASE = 'http://localhost:8082';

async function nextIds(request) {
  const res = await request.get(`${API_BASE}/api/patients/next-ids`);
  return res.json();
}

test.describe('Beds Display — bedless section', () => {
  test('a patient with no bed shows here, and discharge archives them correctly', async ({ page, request }) => {
    const ids = await nextIds(request);
    const name = 'PLAYWRIGHT_BEDLESS_' + Date.now();
    const addRes = await request.post(`${API_BASE}/api/patients/add`, {
      data: {
        patient_id: ids.next_patient_id, stay_id: ids.next_stay_id,
        name, gender: 'Female', age: 34,
        arrival_time: '2026-01-01T09:00', chiefcomplaint: 'Sprained ankle',
        acuity: 4,
      },
    });
    expect(addRes.ok()).toBeTruthy();
    const stayId = ids.next_stay_id;

    try {
      await login(page);
      await gotoBedsDisplay(page);

      const card = page.locator(`#bedless-card-${ids.next_patient_id}`);
      await expect(card).toBeVisible();
      await expect(card).toContainText(name);
      await expect(card).toContainText('Sprained ankle');

      // ER UI Architecture Redesign — the unified card has no separate
      // discharge button; clicking the card itself opens the discharge
      // modal (its one available action, same as before this redesign).
      await card.click();
      await expect(page.locator('#bedless-discharge-modal')).toBeVisible();
      await page.selectOption('#bedless-discharge-destination', 'Home');
      await page.click('#bedless-discharge-confirm-btn');

      await expect(page.locator('#bedless-discharge-modal')).toBeHidden();
      await expect(page.locator(`#bedless-card-${ids.next_patient_id}`)).toHaveCount(0);

      // Archived to LogPatients, not still active.
      const detailsRes = await request.get(`${API_BASE}/api/patients/${stayId}/details`);
      const details = await detailsRes.json();
      expect(details.source).toBe('log');
      expect(details.departure_source).toBe('manual');
    } finally {
      await request.delete(`${API_BASE}/api/data/log-patients/delete/${stayId}`).catch(() => {});
      await request.delete(`${API_BASE}/api/patients/delete/${stayId}`).catch(() => {});
    }
  });
});
