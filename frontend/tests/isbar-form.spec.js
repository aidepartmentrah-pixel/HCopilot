// tests/isbar-form.spec.js — the ISBAR accordion entry form.
//
// Covers: opening the Patients page, expanding/collapsing every section,
// entering representative values across all 6 sections, conditional fields
// appearing/disappearing, collapse-preserves-data, missing-required-field
// messaging, and a full valid submission appearing in the Patient Dataset.

const { test, expect } = require('@playwright/test');
const path = require('path');
const { login, gotoPatients } = require('./helpers');

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const TEST_NAME = 'PLAYWRIGHT_ISBAR_' + Date.now();

test.describe('ISBAR entry form', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await gotoPatients(page);
  });

  test('opens the Patients page with the accordion mounted', async ({ page }) => {
    await expect(page.locator('.pat-add-card')).toBeVisible();
    await expect(page.locator('#isbar-details-patient-arrival-add')).toBeVisible();
    await expect(page.locator('#isbar-details-vitals-add')).toBeVisible();
    // Patient & Arrival and Initial Vital Signs are open by default per spec
    await expect(page.locator('#isbar-details-patient-arrival-add')).toHaveJSProperty('open', true);
    await expect(page.locator('#isbar-details-vitals-add')).toHaveJSProperty('open', true);
    // The 4 metadata-driven sections start collapsed
    const situationDetails = page.locator('#isbar-details-situation-add');
    await expect(situationDetails).toHaveJSProperty('open', false);
  });

  test('expands and collapses every ISBAR section', async ({ page }) => {
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
    // ── 1. Patient & Arrival ──────────────────────────────────────────────
    await page.fill('#pat-name', TEST_NAME);
    await page.selectOption('#pat-gender', 'Female');
    await page.fill('#pat-age', '52');
    await page.fill('#pat-chiefcomplaint', 'Chest pain');
    await page.click('#pat-acuity-scale .pat-scale-btn[data-acuity="2"]');
    await expect(page.locator('#pat-acuity')).toHaveValue('2');

    // ── 2. Initial Vital Signs (+ conditional O2 flow rate) ────────────────
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
    await page.click('#isbar-details-situation-add summary');
    await page.click('[data-field-id="clinical_status"][data-radio-value="Close monitoring"]');
    await expect(page.locator('[data-field-id="immediate_concerns_other"]')).toHaveCount(0);
    await page.click('[data-field-id="immediate_concerns"][data-checkbox-value="chest_pain"]');
    await page.click('[data-field-id="immediate_concerns"][data-checkbox-value="other"]');
    await expect(page.locator('[data-field-id="immediate_concerns_other"]')).toBeVisible();
    await page.fill('[data-field-id="immediate_concerns_other"]', 'Palpitations');

    // ── 4. Background (+ conditional allergy fields) ───────────────────────
    await page.click('#isbar-details-background-add summary');
    await expect(page.locator('[data-field-id="allergy_substance"]')).toHaveCount(0);
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
    await page.click('#isbar-details-focused-add summary');
    await page.click('[data-field-id="fall_risk"][data-radio-value="Yes"]');
    await page.click('[data-field-id="neuro_status"][data-radio-value="Alert"]');

    // ── 6. Recommendation & Handover (+ conditional "Other" plan) ──────────
    await page.click('#isbar-details-recommendation-add summary');
    await page.click('[data-field-id="discharge_transfer_plan"][data-radio-value="other"]');
    await expect(page.locator('[data-field-id="discharge_transfer_plan_other"]')).toBeVisible();
    await page.fill('[data-field-id="discharge_transfer_plan_other"]', 'Transfer to partner facility');
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

    // ── Submission succeeds and the patient appears in the compact table ───
    await expect(page.locator('#message')).toContainText(/added/i, { timeout: 10000 });
    await page.waitForTimeout(500); // table re-render after loadPatients()
    await page.fill('#pat-search', TEST_NAME);
    await expect(page.locator('.s-table tbody tr', { hasText: TEST_NAME })).toHaveCount(1);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'compact-patient-table.png'), fullPage: true });

    // ── Cleanup: delete the test patient via the UI ─────────────────────────
    const row = page.locator('.s-table tbody tr', { hasText: TEST_NAME });
    await row.locator('[data-action="delete-patient"]').click();
    await page.click('#pat-delete-confirm-btn');
    await expect(page.locator('#message')).toContainText(/removed|deleted/i, { timeout: 10000 });
  });
});
