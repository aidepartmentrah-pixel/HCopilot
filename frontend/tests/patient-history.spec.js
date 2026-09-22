// tests/patient-history.spec.js — Page C (History), ER UI Architecture
// Redesign, UI-C1–UI-C7.
//
// Test data is seeded directly via the backend API (same convention as
// patient-details.spec.js/beds-bedless.spec.js) — a discharged stay only
// exists via a real discharge flow (no direct log-patients "add" endpoint),
// so each test creates a daily patient then discharges it through the
// bedless-discharge endpoint (no bed setup needed) to land it in LogPatients.

const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');

const API_BASE = 'http://localhost:8082';

async function nextIds(request) {
  const res = await request.get(`${API_BASE}/api/patients/next-ids`);
  return res.json();
}

async function seedDischargedPatient(request, overrides = {}) {
  const ids = await nextIds(request);
  const name = overrides.name || ('PLAYWRIGHT_HIST_' + Date.now());
  const addRes = await request.post(`${API_BASE}/api/patients/add`, {
    data: {
      patient_id: ids.next_patient_id, stay_id: ids.next_stay_id,
      name, gender: 'Male', age: 45, arrival_time: '2026-02-01T08:00',
      chiefcomplaint: 'Test complaint', acuity: overrides.acuity ?? 3,
    },
  });
  expect(addRes.ok()).toBeTruthy();
  const dischargeRes = await request.post(`${API_BASE}/api/unurgent/discharge/${ids.next_patient_id}`, {
    data: { departure_time: '2026-02-01T12:00', destination: 'Home' },
  });
  expect(dischargeRes.ok()).toBeTruthy();
  return { stayId: ids.next_stay_id, patientId: ids.next_patient_id, name };
}

async function gotoHistory(page) {
  await page.click('.nav-btn[data-section="patient-history"]');
  await page.waitForSelector('#patient-history.section.active');
  await page.waitForSelector('#patient-history-table-container .loading', { state: 'detached', timeout: 15000 });
}

test.describe('Page C — History', () => {
  test('row click opens the persistent preview pane; closing it preserves the table search', async ({ page, request }) => {
    const { name, stayId } = await seedDischargedPatient(request);
    try {
      await login(page);
      await gotoHistory(page);

      await page.fill('#hist-search', name);
      const row = page.locator('.hist-row', { hasText: name });
      await expect(row).toHaveCount(1);

      await expect(page.locator('#hist-preview-pane')).toBeHidden();
      await row.click();
      await expect(page.locator('#hist-preview-pane')).toBeVisible();
      await expect(page.locator('#hist-divider')).toBeVisible();
      await expect(page.locator('#hist-preview-content')).toContainText(name);
      await expect(row).toHaveClass(/hist-row-selected/);

      // Close returns to full width without disturbing the table's own state.
      await page.click('#hist-preview-pane .hist-preview-close');
      await expect(page.locator('#hist-preview-pane')).toBeHidden();
      await expect(page.locator('#hist-divider')).toBeHidden();
      await expect(page.locator('#hist-search')).toHaveValue(name);
      await expect(row).toHaveCount(1); // search filter untouched
    } finally {
      await request.delete(`${API_BASE}/api/data/log-patients/delete/${stayId}`).catch(() => {});
    }
  });

  test('the resizable divider changes the preview pane width within bounds', async ({ page, request }) => {
    const { name, stayId } = await seedDischargedPatient(request);
    try {
      await login(page);
      await gotoHistory(page);
      await page.fill('#hist-search', name);
      await page.locator('.hist-row', { hasText: name }).click();
      await expect(page.locator('#hist-preview-pane')).toBeVisible();

      const before = await page.locator('#hist-preview-pane').boundingBox();
      const divider = page.locator('#hist-divider');
      const box = await divider.boundingBox();

      // Drag left by 120px — the preview pane is to the right of the
      // divider, so dragging left should grow it.
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2, { steps: 5 });
      await page.mouse.up();

      const after = await page.locator('#hist-preview-pane').boundingBox();
      expect(after.width).toBeGreaterThan(before.width + 50);

      // Table pane still respects its own minimum width — dragging way past
      // the edge doesn't crush it to nothing.
      const tableBox = await page.locator('#hist-table-pane').boundingBox();
      expect(tableBox.width).toBeGreaterThanOrEqual(400);
    } finally {
      await request.delete(`${API_BASE}/api/data/log-patients/delete/${stayId}`).catch(() => {});
    }
  });

  test('Open Full Record navigates to the dedicated page and back', async ({ page, request }) => {
    const { name, stayId } = await seedDischargedPatient(request);
    try {
      await login(page);
      await gotoHistory(page);
      await page.fill('#hist-search', name);
      await page.locator('.hist-row', { hasText: name }).click();
      await expect(page.locator('#hist-preview-pane')).toBeVisible();

      await page.click('#hist-preview-content button:has-text("Open Full Record")');
      await expect(page.locator('#patient-full-record.section.active')).toBeVisible();
      await expect(page.locator('#hist-full-record-content')).toContainText(name);
      // Print/Export PDF/Edit Record — UI-C4's footer, not on the preview pane.
      await expect(page.locator('#hist-full-record-content button:has-text("Print")')).toBeVisible();
      await expect(page.locator('#hist-full-record-content button:has-text("Export PDF")')).toBeVisible();
      await expect(page.locator('#hist-full-record-content button:has-text("Edit Record")')).toBeVisible();

      await page.click('button:has-text("Back to History")');
      await expect(page.locator('#patient-history.section.active')).toBeVisible();
      // Table state (the search we typed earlier) survived the round trip.
      await expect(page.locator('#hist-search')).toHaveValue(name);
    } finally {
      await request.delete(`${API_BASE}/api/data/log-patients/delete/${stayId}`).catch(() => {});
    }
  });

  test('acuity filter narrows the table to matching rows', async ({ page, request }) => {
    const a = await seedDischargedPatient(request, { acuity: 1 });
    const b = await seedDischargedPatient(request, { acuity: 5 });
    try {
      await login(page);
      await gotoHistory(page);

      // Scope to just these two rows via search-by-name-prefix isn't
      // possible (names are unique per seed) — filter by acuity directly
      // and check each seeded row's expected presence/absence.
      await page.selectOption('#hist-filter-acuity', '1');
      await expect(page.locator('.hist-row', { hasText: a.name })).toHaveCount(1);
      await expect(page.locator('.hist-row', { hasText: b.name })).toHaveCount(0);

      await page.selectOption('#hist-filter-acuity', '5');
      await expect(page.locator('.hist-row', { hasText: a.name })).toHaveCount(0);
      await expect(page.locator('.hist-row', { hasText: b.name })).toHaveCount(1);

      await page.click('button:has-text("Clear")');
      await expect(page.locator('#hist-filter-acuity')).toHaveValue('');
      // Clearing shows the full ~100-record archive, unpaginated beyond
      // page 1 — search by name (client-side, unaffected by pagination) to
      // confirm both rows are really back in the filtered set, rather than
      // assuming either lands on page 1 by coincidence of insertion order.
      await page.fill('#hist-search', a.name);
      await expect(page.locator('.hist-row', { hasText: a.name })).toHaveCount(1);
      await page.fill('#hist-search', b.name);
      await expect(page.locator('.hist-row', { hasText: b.name })).toHaveCount(1);
    } finally {
      await request.delete(`${API_BASE}/api/data/log-patients/delete/${a.stayId}`).catch(() => {});
      await request.delete(`${API_BASE}/api/data/log-patients/delete/${b.stayId}`).catch(() => {});
    }
  });

  test('deleting a row from History removes it immediately (regression: delete still reaches this page)', async ({ page, request }) => {
    const { name, stayId } = await seedDischargedPatient(request);
    await login(page);
    await gotoHistory(page);
    await page.fill('#hist-search', name);
    const row = page.locator('.hist-row', { hasText: name });
    await expect(row).toHaveCount(1);

    await row.locator('[data-action="toggle-row-menu"]').click();
    await row.locator('[data-action="hist-delete"]').click();
    await page.click('#pat-delete-confirm-btn');
    await expect(page.locator('#message')).toContainText(/removed|deleted/i, { timeout: 10000 });
    await expect(page.locator('.hist-row', { hasText: name })).toHaveCount(0);
  });
});
