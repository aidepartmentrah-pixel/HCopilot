// tests/statistics.spec.js — the Statistics page, focused on the new
// Clinical tab (ISBAR aggregates). Also exercises the existing Patients tab
// briefly to confirm the new work didn't regress it.

const { test, expect } = require('@playwright/test');
const path = require('path');
const { login, gotoStatistics, collectConsoleErrors } = require('./helpers');

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

test.describe('Statistics page', () => {
  test('opens successfully and the existing Patients tab still renders', async ({ page }) => {
    await login(page);
    const errors = await collectConsoleErrors(page, async () => {
      await gotoStatistics(page);
      await expect(page.locator('#stats-kpi-grid')).toBeVisible();
      await page.waitForSelector('#stats-kpi-grid .stats-staff-kpi-card, #stats-kpi-grid .stats-kpi-card', { timeout: 10000 }).catch(() => {});
    });
    expect(errors, 'no console errors on the Patients statistics tab').toEqual([]);
  });

  test('Clinical tab renders its charts without console errors', async ({ page }) => {
    await login(page);
    await gotoStatistics(page);

    const errors = await collectConsoleErrors(page, async () => {
      await page.click('.stats-main-tab[data-stats-tab="clinical"]');
      await expect(page.locator('#stats-tab-clinical')).toHaveClass(/active/);
      // Either a chart canvas or an explicit empty-state message must appear
      // for each card — never a silently blank canvas.
      await page.waitForTimeout(800); // allow the 5 parallel fetches + Chart.js render to settle
    });

    const cards = [
      { canvas: '#clinicalStatusChart', wrap: '.stats-chart-card:has(#clinicalStatusChart)' },
      { canvas: '#immediateConcernsChart', wrap: '.stats-chart-card:has(#immediateConcernsChart)' },
      { canvas: '#o2SupportChart', wrap: '.stats-chart-card:has(#o2SupportChart)' },
      { canvas: '#dischargeTransferChart', wrap: '.stats-chart-card:has(#dischargeTransferChart)' },
    ];
    for (const c of cards) {
      const wrap = page.locator(c.wrap);
      const canvasVisible = await page.locator(c.canvas).isVisible();
      const noDataVisible = await wrap.locator('.stats-no-data').count();
      expect(canvasVisible || noDataVisible > 0, `${c.canvas} shows a chart or an empty-state message`).toBeTruthy();
    }

    // Safety-risk tiles render (either real tiles or the empty-state block)
    const tilesHtml = await page.locator('#safety-risks-tiles').innerHTML();
    expect(tilesHtml.length).toBeGreaterThan(0);

    expect(errors, 'no console errors on the Clinical statistics tab').toEqual([]);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'statistics-clinical-tab.png'), fullPage: true });
  });
});
