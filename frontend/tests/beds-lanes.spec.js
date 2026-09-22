// tests/beds-lanes.spec.js — Page B, the Live ER Board
// (ER UI Architecture Redesign, UI-B1–UI-B7).
//
// Covers what isbar-form.spec.js/beds-bedless.spec.js don't already:
// horizontal ward + Waiting/No-Bed lane rendering, the unified bed/no-bed
// card sharing real dimensions (confirmed decision #5), the summary stat
// row (UI-B4), and the waiting-time attention treatment appearing/clearing
// (UI-B5, open question 3: "handled" = triage_time set). Soft-departure-
// removes-immediately (UI-B6) is already covered end-to-end by
// beds-bedless.spec.js and er-departure-safety-net.spec.js — not repeated here.

const { test, expect } = require('@playwright/test');
const { login, gotoBedsDisplay } = require('./helpers');

const API_BASE = 'http://localhost:8082';

async function nextIds(request) {
  const res = await request.get(`${API_BASE}/api/patients/next-ids`);
  return res.json();
}

test.describe('Page B — Live ER Board', () => {
  test('renders ward lanes plus one catch-all Waiting/No-Bed lane, with a summary stat row', async ({ page }) => {
    await login(page);
    await gotoBedsDisplay(page);

    // Summary stat row (UI-B4) — all 5 tiles present with real numbers.
    const stats = page.locator('.erb-stats-bar .s-stat-card');
    await expect(stats).toHaveCount(5);
    await expect(page.locator('.erb-stats-bar')).toContainText('Total Beds');
    await expect(page.locator('.erb-stats-bar')).toContainText('Occupied Beds');
    await expect(page.locator('.erb-stats-bar')).toContainText('Available Beds');
    await expect(page.locator('.erb-stats-bar')).toContainText('Patients Without Bed');
    await expect(page.locator('.erb-stats-bar')).toContainText('Waiting > 5 min');

    // At least one ward lane, and exactly one Waiting/No-Bed lane (catch-all,
    // not per-ward — open question 2, confirmed).
    const lanes = page.locator('.erb-lane');
    await expect(lanes.first()).toBeVisible();
    const waitingLane = page.locator('.erb-lane', { hasText: 'Waiting / No Bed' });
    await expect(waitingLane).toHaveCount(1);
  });

  test('bed and waiting cards share one component family — same size, only icon/status differ', async ({ page, request }) => {
    // Seed a bedless patient so the Waiting lane is guaranteed non-empty.
    const ids = await nextIds(request);
    const name = 'PLAYWRIGHT_LANES_' + Date.now();
    const addRes = await request.post(`${API_BASE}/api/patients/add`, {
      data: {
        patient_id: ids.next_patient_id, stay_id: ids.next_stay_id,
        name, gender: 'Male', age: 40, arrival_time: '2026-01-01T08:00',
        chiefcomplaint: 'Test complaint', acuity: 3,
      },
    });
    expect(addRes.ok()).toBeTruthy();
    const stayId = ids.next_stay_id;

    try {
      await login(page);
      await gotoBedsDisplay(page);

      const bedCard = page.locator('.erb-card').filter({ has: page.locator('.erb-card-status-badge', { hasText: /available|occupied/i }) }).first();
      const waitingCard = page.locator(`#bedless-card-${ids.next_patient_id}`);
      await expect(waitingCard).toBeVisible();

      // Both are members of the same shared component and both carry a
      // status badge — the same DOM shape either way.
      await expect(bedCard).toHaveClass(/erb-card/);
      await expect(waitingCard).toHaveClass(/erb-card/);
      await expect(bedCard.locator('.erb-card-status-badge')).toBeVisible();
      await expect(waitingCard.locator('.erb-card-status-badge')).toContainText(/waiting/i);

      // Real, rendered dimensions match — not just the same class name.
      const bedBox = await bedCard.boundingBox();
      const waitingBox = await waitingCard.boundingBox();
      expect(bedBox).toBeTruthy();
      expect(waitingBox).toBeTruthy();
      expect(Math.abs(bedBox.width - waitingBox.width)).toBeLessThan(1);
    } finally {
      await request.delete(`${API_BASE}/api/patients/delete/${stayId}`).catch(() => {});
    }
  });

  test('waiting-time attention treatment appears past 5 minutes and clears once triaged', async ({ page, request }) => {
    const ids = await nextIds(request);
    const name = 'PLAYWRIGHT_WAITFLAG_' + Date.now();
    // A real arrival 10 minutes ago (not a fixed past date) — the threshold
    // is computed against "now", so the test data must be too.
    const arrivalTime = new Date(Date.now() - 10 * 60 * 1000).toISOString().slice(0, 16);
    const addRes = await request.post(`${API_BASE}/api/patients/add`, {
      data: {
        patient_id: ids.next_patient_id, stay_id: ids.next_stay_id,
        name, gender: 'Female', age: 30, arrival_time: arrivalTime,
        chiefcomplaint: 'Test complaint', acuity: 3,
      },
    });
    expect(addRes.ok()).toBeTruthy();
    const stayId = ids.next_stay_id;

    try {
      await login(page);
      await gotoBedsDisplay(page);

      const card = page.locator(`#bedless-card-${ids.next_patient_id}`);
      await expect(card).toBeVisible();
      await expect(card).toHaveClass(/erb-card-attention/);
      await expect(card.locator('.erb-card-wait-badge')).toContainText(/waiting \d+m/i);

      // Mark as handled (triage_time set) — the flag must clear on refresh.
      // This patient isn't roster-origin, so the server's
      // check_required_by_origin validator demands the full Patient &
      // Arrival set on every modify, not just at creation.
      const modRes = await request.put(`${API_BASE}/api/patients/modify/${stayId}`, {
        data: {
          patient_id: ids.next_patient_id, name, gender: 'Female', age: 30,
          arrival_time: arrivalTime, chiefcomplaint: 'Test complaint', acuity: 3,
          triage_time: new Date().toISOString().slice(0, 16),
        },
      });
      expect(modRes.ok()).toBeTruthy();
      await gotoBedsDisplay(page); // re-fetch

      const cardAfter = page.locator(`#bedless-card-${ids.next_patient_id}`);
      await expect(cardAfter).toBeVisible();
      await expect(cardAfter).not.toHaveClass(/erb-card-attention/);
      await expect(cardAfter.locator('.erb-card-wait-badge')).toHaveCount(0);
    } finally {
      await request.delete(`${API_BASE}/api/patients/delete/${stayId}`).catch(() => {});
    }
  });
});
