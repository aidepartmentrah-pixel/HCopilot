// @ts-check
// tests/er-api-v12-settings.spec.js — old UI: Settings → Hospital Directory API
// → "ER API · Live ER roster". Since 3iSoft's v1.2 delivery (18 Nov 2026) the
// roster has its OWN connection (ER base URL + ER key), saved separately from
// the Directory. PRECONDITION: the v1.2 mock on port 6001 (override with
// E2E_ER_BASE_URL, e.g. host.docker.internal when the backend runs in Docker).

const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');

const ER_BASE_URL = process.env.E2E_ER_BASE_URL || 'http://localhost:6001/his-er/api/er/v1';
const MOCK_KEY = process.env.E2E_ER_API_KEY || 'dev-secret-key';

async function openHdSettings(page) {
  await login(page);
  await page.click('.nav-btn[data-section="settings"]');
  await page.click('#stabg-system .stab-group-btn'); // the tab lives in the "System" drop-down group
  await page.click('.settings-tab[data-tab="hospital-directory"]');
  await expect(page.locator('#hd-er-base-url')).toBeVisible({ timeout: 10000 });
}

async function saveEr(page, url, key) {
  await page.fill('#hd-er-base-url', url);
  if (key) await page.fill('#hd-er-api-key', key);
  const saved = page.waitForResponse((r) => r.url().includes('/config/er-roster/save') && r.ok());
  await page.click('#hd-er-save-btn');
  await saved;
}

test.describe('Old UI — ER API settings (v1.2)', () => {
  test.afterAll(async ({ request }) => {
    // Leave the dev backend on the working mock settings, switch on.
    await request.post('/api/hospital-directory/config/er-roster/save', { data: { er_base_url: ER_BASE_URL, er_api_key: MOCK_KEY } });
    await request.post('/api/hospital-directory/config/er-roster/enable', { data: { enabled: true } });
  });

  test('saves the ER URL + key separately and Test ER roster lists 18 patients', async ({ page }) => {
    await openHdSettings(page);
    const dirUrlBefore = await page.inputValue('#hd-base-url');
    await saveEr(page, ER_BASE_URL, MOCK_KEY);
    await expect(page.locator('#hd-er-base-url')).toHaveValue(ER_BASE_URL);
    await expect(page.locator('#hd-er-api-key')).toHaveAttribute('placeholder', /Current ER key: .+ leave blank to keep it/);
    await expect(page.locator('#hd-base-url')).toHaveValue(dirUrlBefore); // Directory untouched

    await page.click('#hd-roster-test-btn');
    await expect(page.locator('#hd-roster-test-result')).toContainText('18 patient(s) currently listed', { timeout: 15000 });
  });

  test('a wrong ER key is reported as "ER API key rejected"', async ({ page }) => {
    await openHdSettings(page);
    await saveEr(page, ER_BASE_URL, 'not-the-er-key');
    await page.click('#hd-roster-test-btn');
    await expect(page.locator('#hd-roster-test-result')).toContainText('ER API key rejected', { timeout: 15000 });
  });
});
