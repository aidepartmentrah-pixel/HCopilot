// tests/patient-details.spec.js — the read-only Patient Details modal.
//
// Test data is seeded directly via the backend API (fast, reliable) rather
// than re-driving the whole entry form — the entry form itself is already
// covered by isbar-form.spec.js. This spec is only about the *details view*:
// does saved data show up in the right sections, and does missing data
// render as "Not recorded" rather than being fabricated or left blank.

const { test, expect } = require('@playwright/test');
const path = require('path');
const { login, gotoPatients, expandActivePatients } = require('./helpers');

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const API_BASE = 'http://localhost:8082';

async function nextIds(request) {
  const res = await request.get(`${API_BASE}/api/patients/next-ids`);
  return res.json();
}

async function deletePatient(request, stayId) {
  await request.delete(`${API_BASE}/api/patients/delete/${stayId}`).catch(() => {});
}

test.describe('Patient Details view', () => {
  test('shows saved ISBAR data in the correct sections', async ({ page, request }) => {
    const ids = await nextIds(request);
    const name = 'PLAYWRIGHT_DETAILS_' + Date.now();
    const addRes = await request.post(`${API_BASE}/api/patients/add`, {
      data: {
        patient_id: ids.next_patient_id, stay_id: ids.next_stay_id,
        name, gender: 'Male', age: 61,
        arrival_time: '2026-01-01T08:00', chiefcomplaint: 'Shortness of breath',
        temperature: 37.8, heartrate: 88, resprate: 20, o2sat: 93, sbp: 132, dbp: 84,
        pain: '4', acuity: 2,
        // Every field below is required together within its section under the
        // "fill it all once started" rule (see check_isbar's
        // _group_all_or_nothing calls) — each of the 4 sections here is
        // touched, so each must be fully completed.
        isbar: {
          reason_for_admission: 'Progressive dyspnea', current_diagnosis: 'Possible pneumonia',
          clinical_status: 'Deteriorating',
          immediate_concerns: 'respiratory_distress,sepsis',
          surgical_history_flag: 'No',
          allergies_status: 'Yes', allergy_substance: 'Latex', allergy_reaction: 'Hives',
          isolation_precautions: 'Contact',
          neuro_status: 'Alert', telemetry: 'Yes', edema: 'No', peripheral_pulses: 'Yes',
          diet: 'Regular', npo: 'No', swallow_assessment: 'Passed', last_bowel_movement: 'Today',
          voiding: 'Independent', urinary_catheter: 'No', wounds: 'No',
          fall_risk: 'Yes', pressure_injury_risk: 'No', mobility_aids: 'No',
          intake_ml: 400, output_ml: 250,
          critical_lab_results: 'None', pending_labs: 'ABG', pending_imaging: 'Chest X-ray',
          meds_due_next_shift: 'Ceftriaxone 1g', pending_medical_review: 'Pulmonology',
          consultations: 'Pulmonology',
          discharge_transfer_plan: 'icu_hdu',
          outgoing_nurse: 'PLAYWRIGHT_NURSE', incoming_nurse: 'PLAYWRIGHT_NURSE_2',
          handover_datetime: '2026-01-01T20:00',
        },
      },
    });
    expect(addRes.ok()).toBeTruthy();
    const stayId = ids.next_stay_id;

    try {
      await login(page);
      await gotoPatients(page);
      await expandActivePatients(page);
      await page.fill('#pat-search', name);
      const row = page.locator('.s-table tbody tr', { hasText: name });
      await expect(row).toHaveCount(1);
      await row.locator('[data-action="view-patient-details"]').click();

      await expect(page.locator('#patient-details-modal')).toBeVisible();
      await expect(page.locator('#pdetails-content')).toContainText(name);
      await expect(page.locator('#pdetails-content')).toContainText('Deteriorating');

      // Warning badges in the sticky header (allergy / isolation / fall risk)
      await expect(page.locator('.pdetails-badges')).toContainText(/Allergy/);
      await expect(page.locator('.pdetails-badges')).toContainText(/Isolation/);
      await expect(page.locator('.pdetails-badges')).toContainText(/Fall Risk/);

      // Background section — expand and check the allergy detail fields
      await page.locator('.pdetails-body summary', { hasText: 'Background' }).click();
      await expect(page.locator('#pdetails-content')).toContainText('Latex');
      await expect(page.locator('#pdetails-content')).toContainText('Hives');

      // Recommendation section
      await page.locator('.pdetails-body summary', { hasText: 'Recommendation' }).click();
      await expect(page.locator('#pdetails-content')).toContainText('PLAYWRIGHT_NURSE');

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'patient-details-view.png'), fullPage: true });
    } finally {
      await deletePatient(request, stayId);
    }
  });

  test('shows "Not recorded" for a stay with no ISBAR data', async ({ page, request }) => {
    const ids = await nextIds(request);
    const name = 'PLAYWRIGHT_NOISBAR_' + Date.now();
    const addRes = await request.post(`${API_BASE}/api/patients/add`, {
      data: {
        patient_id: ids.next_patient_id, stay_id: ids.next_stay_id,
        name, gender: 'Female', age: 34,
        arrival_time: '2026-01-01T09:00', chiefcomplaint: 'Ankle sprain',
        temperature: 36.9, heartrate: 76, resprate: 16, o2sat: 99, sbp: 118, dbp: 76,
        pain: '2', acuity: 4,
      },
    });
    expect(addRes.ok()).toBeTruthy();
    const stayId = ids.next_stay_id;

    try {
      await login(page);
      await gotoPatients(page);
      await expandActivePatients(page);
      await page.fill('#pat-search', name);
      const row = page.locator('.s-table tbody tr', { hasText: name });
      await expect(row).toHaveCount(1);
      // No risk badges should render for a stay with no ISBAR data
      await expect(row.locator('.pat-badges-cell')).toHaveCount(0);

      await row.locator('[data-action="view-patient-details"]').click();
      await expect(page.locator('#patient-details-modal')).toBeVisible();
      await page.locator('.pdetails-body summary', { hasText: 'Situation' }).click();
      const notRecordedCount = await page.locator('#pdetails-content .value.not-recorded').count();
      expect(notRecordedCount).toBeGreaterThan(0);
    } finally {
      await deletePatient(request, stayId);
    }
  });
});
