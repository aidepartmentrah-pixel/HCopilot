// tests/isbar-form.spec.js — the ISBAR accordion entry form (Page A of the
// ER UI Architecture Redesign).
//
// Covers: the disabled-by-default state, unlocking a manual entry via the
// secondary fallback, expanding/collapsing every section, entering
// representative values across all 6 sections, conditional fields
// appearing/disappearing, collapse-preserves-data, missing-required-field
// messaging, and a full valid submission appearing in the Active Patients table.

const { test, expect } = require('@playwright/test');
const path = require('path');
const { login, gotoPatients, expandActivePatients } = require('./helpers');

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const TEST_NAME = 'PLAYWRIGHT_ISBAR_' + Date.now();

// Page A's ISBAR panel is disabled until a patient is selected — the manual
// fallback (behind the collapsed "Can't find the patient?" toggle) is the
// path that unlocks it without picking anything off the roster.
async function unlockManualEntry(page) {
  await page.click('#pat-a-fallback-toggle');
  await page.click('.pat-a-manual-btn');
  await expect(page.locator('#pat-name')).toBeEnabled();
}

test.describe('ISBAR entry form (Page A)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await gotoPatients(page);
  });

  test('starts disabled with a placeholder; Enter Manually unlocks the form with only Patient & Arrival open', async ({ page }) => {
    await expect(page.locator('#pat-a-placeholder')).toBeVisible();
    await expect(page.locator('#pat-a-banner')).toBeHidden();
    await expect(page.locator('#pat-name')).toBeDisabled();
    await expect(page.locator('#pat-a-footer')).toBeHidden();

    await unlockManualEntry(page);

    await expect(page.locator('#pat-a-placeholder')).toBeHidden();
    await expect(page.locator('#pat-a-footer')).toBeVisible();
    await expect(page.locator('.pat-a-isbar-panel')).toHaveAttribute('data-mode', 'draft');
    await expect(page.locator('#isbar-details-patient-arrival-add')).toBeVisible();
    await expect(page.locator('#isbar-details-vitals-add')).toBeVisible();
    // Only Patient & Arrival opens by default; everything else (including
    // Vitals) stays collapsed until the user continues or opens it manually
    await expect(page.locator('#isbar-details-patient-arrival-add')).toHaveJSProperty('open', true);
    await expect(page.locator('#isbar-details-vitals-add')).toHaveJSProperty('open', false);
    const situationDetails = page.locator('#isbar-details-situation-add');
    await expect(situationDetails).toHaveJSProperty('open', false);
  });

  test('"Continue to Vital Signs" opens the Vitals section', async ({ page }) => {
    await unlockManualEntry(page);
    await expect(page.locator('#isbar-details-vitals-add')).toHaveJSProperty('open', false);
    await page.click('#isbar-details-patient-arrival-add button:has-text("Continue to Vital Signs")');
    await expect(page.locator('#isbar-details-vitals-add')).toHaveJSProperty('open', true);
  });

  test('expands and collapses every ISBAR section', async ({ page }) => {
    await unlockManualEntry(page);
    const sectionIds = ['patient-arrival', 'vitals', 'situation', 'background', 'focused', 'recommendation'];
    for (const id of sectionIds) {
      const details = page.locator(`#isbar-details-${id}-add`);
      const summary = details.locator('summary');
      const wasOpen = await details.evaluate(el => el.open);
      await summary.click();
      await expect(details).toHaveJSProperty('open', !wasOpen);
      await summary.click();
      await expect(details).toHaveJSProperty('open', wasOpen);
    }
  });

  test('fills representative values across all sections, handles conditional fields, and submits', async ({ page }) => {
    await unlockManualEntry(page);

    // ── 1. Patient & Arrival ──────────────────────────────────────────────
    await page.fill('#pat-name', TEST_NAME);
    await page.selectOption('#pat-gender', 'Female');
    await page.fill('#pat-age', '52');
    await page.fill('#pat-chiefcomplaint', 'Chest pain');
    await page.click('#pat-acuity-scale .pat-scale-btn[data-acuity="2"]');
    await expect(page.locator('#pat-acuity')).toHaveValue('2');

    // ── 2. Initial Vital Signs (+ conditional O2 flow rate) ────────────────
    // Vitals is collapsed by default now — open it via the same "Continue"
    // affordance a real user would use.
    await page.click('#isbar-details-patient-arrival-add button:has-text("Continue to Vital Signs")');
    await expect(page.locator('#isbar-details-vitals-add')).toHaveJSProperty('open', true);
    await page.fill('#pat-temperature', '38.1');
    await page.fill('#pat-heartrate', '92');
    await page.fill('#pat-resprate', '18');
    await page.fill('#pat-o2sat', '96');
    await page.fill('#pat-sbp', '140');
    await page.fill('#pat-dbp', '88');
    await page.fill('#pat-blood-glucose', '105');
    await page.click('#pat-pain-scale .pat-scale-btn[data-pain="6"]');
    await expect(page.locator('#pat-pain')).toHaveValue('6');

    // O2 flow rate is hidden until a support type that needs one is selected
    await expect(page.locator('#pat-o2-flow-wrap')).toBeHidden();
    await page.selectOption('#pat-o2-support', 'nasal_cannula');
    await expect(page.locator('#pat-o2-flow-wrap')).toBeVisible();
    await page.fill('#pat-o2-flow-rate', '2');
    // Switching to a support type that doesn't need a flow rate hides it
    // again (and clears the now-irrelevant value)
    await page.selectOption('#pat-o2-support', 'room_air');
    await expect(page.locator('#pat-o2-flow-wrap')).toBeHidden();
    await expect(page.locator('#pat-o2-flow-rate')).toHaveValue('');
    // Restore nasal_cannula for submission — the backend requires a flow
    // rate for this support type, so it must be re-filled after the clear above
    await page.selectOption('#pat-o2-support', 'nasal_cannula');
    await page.fill('#pat-o2-flow-rate', '2');

    // ── 3. Situation (+ conditional "Other" text) ──────────────────────────
    // Situation is optional but "fill it all once started" — every field
    // below is required together the moment any one of them is touched.
    await page.click('#isbar-details-situation-add summary');
    await page.fill('[data-field-id="reason_for_admission"]', 'Chest pain, 2 hours duration');
    await page.fill('[data-field-id="current_diagnosis"]', 'Rule out ACS');
    await page.click('[data-field-id="clinical_status"][data-radio-value="Close monitoring"]');
    await expect(page.locator('[data-field-id="immediate_concerns_other"]')).toHaveCount(0);
    await page.click('[data-field-id="immediate_concerns"][data-checkbox-value="chest_pain"]');
    await page.click('[data-field-id="immediate_concerns"][data-checkbox-value="other"]');
    await expect(page.locator('[data-field-id="immediate_concerns_other"]')).toBeVisible();
    await page.fill('[data-field-id="immediate_concerns_other"]', 'Palpitations');

    // ── 4. Background (+ conditional allergy fields) ───────────────────────
    // Background's other required-once-started field (surgical_history_flag)
    // must also be set — same "fill it all once started" rule as Situation.
    await page.click('#isbar-details-background-add summary');
    await expect(page.locator('[data-field-id="allergy_substance"]')).toHaveCount(0);
    await page.click('[data-field-id="surgical_history_flag"][data-radio-value="No"]');
    await page.click('[data-field-id="allergies_status"][data-radio-value="Yes"]');
    await expect(page.locator('[data-field-id="allergy_substance"]')).toBeVisible();
    await page.fill('[data-field-id="allergy_substance"]', 'Penicillin');
    await page.fill('[data-field-id="allergy_reaction"]', 'Rash');
    await page.click('[data-field-id="isolation_precautions"][data-radio-value="None"]');

    // Collapse Background, then re-expand — entered values must survive
    await page.click('#isbar-details-background-add summary');
    await expect(page.locator('#isbar-details-background-add')).toHaveJSProperty('open', false);
    await page.click('#isbar-details-background-add summary');
    await expect(page.locator('[data-field-id="allergy_substance"]')).toHaveValue('Penicillin');
    await expect(page.locator('[data-field-id="allergy_reaction"]')).toHaveValue('Rash');

    // ── 5. Focused Assessment ───────────────────────────────────────────────
    // Focused Assessment has no checkbox-group/boolean-exempt fields besides
    // lines_tubes_drains, so touching any one of its ~19 fields requires all
    // the rest under "fill it all once started" — fill every one.
    await page.click('#isbar-details-focused-add summary');
    await page.click('[data-field-id="neuro_status"][data-radio-value="Alert"]');
    await page.click('[data-field-id="telemetry"][data-radio-value="No"]');
    await page.click('[data-field-id="edema"][data-radio-value="No"]');
    await page.click('[data-field-id="peripheral_pulses"][data-radio-value="Yes"]');
    await page.fill('[data-field-id="diet"]', 'Regular');
    await page.click('[data-field-id="npo"][data-radio-value="No"]');
    await page.click('[data-field-id="swallow_assessment"][data-radio-value="Passed"]');
    await page.fill('[data-field-id="last_bowel_movement"]', 'Today');
    await page.click('[data-field-id="voiding"][data-radio-value="Independent"]');
    await page.click('[data-field-id="urinary_catheter"][data-radio-value="No"]');
    await page.click('[data-field-id="wounds"][data-radio-value="No"]');
    await page.click('[data-field-id="fall_risk"][data-radio-value="Yes"]');
    await page.click('[data-field-id="pressure_injury_risk"][data-radio-value="No"]');
    await page.click('[data-field-id="mobility_aids"][data-radio-value="No"]');
    await page.click('[data-field-id="lines_tubes_drains"][data-checkbox-value="peripheral_iv"]');
    await page.fill('[data-field-id="intake_ml"]', '500');
    await page.fill('[data-field-id="output_ml"]', '300');
    await page.fill('[data-field-id="critical_lab_results"]', 'None');
    await page.fill('[data-field-id="pending_labs"]', 'CBC');
    await page.fill('[data-field-id="pending_imaging"]', 'CXR');

    // ── 6. Recommendation & Handover (+ conditional "Other" plan) ──────────
    await page.click('#isbar-details-recommendation-add summary');
    await page.fill('[data-field-id="meds_due_next_shift"]', 'Aspirin 81mg');
    await page.fill('[data-field-id="pending_medical_review"]', 'Cardiology consult');
    await page.fill('[data-field-id="consultations"]', 'Cardiology');
    await page.click('[data-field-id="discharge_transfer_plan"][data-radio-value="other"]');
    await expect(page.locator('[data-field-id="discharge_transfer_plan_other"]')).toBeVisible();
    await page.fill('[data-field-id="discharge_transfer_plan_other"]', 'Transfer to partner facility');
    await page.fill('[data-field-id="outgoing_nurse"]', 'PYTEST_OUT');
    await page.fill('[data-field-id="incoming_nurse"]', 'PYTEST_IN');
    await page.fill('[data-field-id="handover_datetime"]', '2026-01-01T07:00');
    await page.check('[data-field-id="receiver_ack"]');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'entry-form-expanded.png'), fullPage: true });

    // ── Missing-required-field messaging: clear name, try to submit ────────
    await page.fill('#pat-name', '');
    await page.click('#pat-add-btn');
    await expect(page.locator('#pat-add-error')).toBeVisible();
    await expect(page.locator('#pat-add-error')).toContainText(/name/i);

    // Refill and submit for real
    await page.fill('#pat-name', TEST_NAME);
    await page.click('#pat-add-btn');

    // ── Submission succeeds; the panel activates in place (no modal) and the
    // patient appears in the Active Patients table below ─────────────────
    await expect(page.locator('#message')).toContainText(/added/i, { timeout: 10000 });
    await expect(page.locator('.pat-a-isbar-panel')).toHaveAttribute('data-mode', 'active', { timeout: 10000 });
    await expect(page.locator('#pat-a-banner-name')).toContainText(TEST_NAME);
    await page.waitForTimeout(500); // table re-render after loadPatients()
    await expandActivePatients(page);
    await page.fill('#pat-search', TEST_NAME);
    await expect(page.locator('.s-table tbody tr', { hasText: TEST_NAME })).toHaveCount(1);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'compact-patient-table.png'), fullPage: true });

    // ── Cleanup: delete the test patient via the UI (Delete lives in the
    // row's "⋯" overflow menu, not a direct button) ─────────────────────────
    const row = page.locator('.s-table tbody tr', { hasText: TEST_NAME });
    await row.locator('[data-action="toggle-row-menu"]').click();
    await row.locator('[data-action="delete-patient"]').click();
    await page.click('#pat-delete-confirm-btn');
    await expect(page.locator('#message')).toContainText(/removed|deleted/i, { timeout: 10000 });
  });

  test('saving ISBAR notes on an active stay preserves an already-assigned bed_occupation_time (2026-09-22 fix)', async ({ page, request }) => {
    // Departure Time / Bed Occupation Time have no input on this form
    // anymore (they're never typed here) — but bed_occupation_time is a
    // real column a genuine bed assignment may have already set, and
    // PUT /modify overwrites every field unconditionally. This proves the
    // panel resends the real cached value instead of silently nulling it
    // out the next time the nurse saves an ISBAR note.
    const API_BASE = 'http://localhost:8082';
    const name = 'PLAYWRIGHT_BEDOCC_' + Date.now();
    const idsRes = await request.get(`${API_BASE}/api/patients/next-ids`);
    const ids = await idsRes.json();
    const addRes = await request.post(`${API_BASE}/api/patients/add`, {
      data: {
        patient_id: ids.next_patient_id, stay_id: ids.next_stay_id, name,
        gender: 'Male', age: 50, arrival_time: '2026-02-01T08:00',
        chiefcomplaint: 'Test complaint', acuity: 3,
      },
    });
    expect(addRes.ok()).toBeTruthy();

    const bedRes = await request.post(`${API_BASE}/api/beds/add`, {
      data: { bed_number: 'PLAYWRIGHT-BEDOCC-' + Date.now(), bed_type: 'normal' },
    });
    expect(bedRes.ok()).toBeTruthy();
    const bedId = (await bedRes.json()).bed.bed_id;

    try {
      const occupationTime = '2026-02-01T08:15';
      const assignRes = await request.post(`${API_BASE}/api/beds/assign/${bedId}`, {
        data: { patient_id: ids.next_patient_id, bed_occupation_time: occupationTime },
      });
      expect(assignRes.ok()).toBeTruthy();

      const beforeRes = await request.get(`${API_BASE}/api/patients/${ids.next_stay_id}/details`);
      expect((await beforeRes.json()).bed_occupation_time).toContain('2026-02-01');

      // Select the stay on Page A (Active Patients table → Edit) and save
      // an unrelated vital — must not touch bed_occupation_time.
      // (beforeEach already logged in; re-visit to refresh past the API
      // fixture's own patient/bed creation, invisible to the page until now.)
      await gotoPatients(page);
      await expandActivePatients(page);
      await page.fill('#pat-search', name);
      const row = page.locator('.s-table tbody tr', { hasText: name });
      await expect(row).toHaveCount(1);
      await row.locator('[data-action="edit-patient"]').click();
      await expect(page.locator('.pat-a-isbar-panel')).toHaveAttribute('data-mode', 'active', { timeout: 10000 });

      await page.click('#isbar-details-patient-arrival-add button:has-text("Continue to Vital Signs")');
      await page.fill('#pat-heartrate', '77');
      await page.click('#pat-add-btn');
      await expect(page.locator('#message')).toContainText(/updated/i, { timeout: 10000 });

      const afterRes = await request.get(`${API_BASE}/api/patients/${ids.next_stay_id}/details`);
      const after = await afterRes.json();
      expect(after.heartrate).toBe(77);
      expect(after.bed_occupation_time).toContain('2026-02-01'); // still there, not wiped
    } finally {
      await request.delete(`${API_BASE}/api/patients/delete/${ids.next_stay_id}`).catch(() => {});
      await request.delete(`${API_BASE}/api/beds/delete/${bedId}`).catch(() => {});
    }
  });
});
