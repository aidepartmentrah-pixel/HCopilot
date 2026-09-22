// tests/helpers.js — shared Playwright helpers for the HCopilot E2E suite.

async function login(page, username = 'admin', password = 'admin') {
  await page.goto('/');
  await page.fill('#auth-username', username);
  await page.fill('#auth-password', password);
  await page.click('#auth-login-btn');
  await page.waitForSelector('#auth-overlay', { state: 'hidden' });
}

async function gotoPatients(page) {
  await page.click('.nav-btn[data-section="patients"]');
  await page.waitForSelector('#patients.section.active');
  // loadPatients() fetches /api/patients/list + /api/patients/stats and the
  // bed map before rendering the table and mounting the ISBAR accordion —
  // wait for that loading spinner to clear rather than just the static
  // container div (which is present from initial HTML, before any of that
  // async work resolves), so assertions run against a fully-settled page.
  await page.waitForSelector('#patients-table-container .loading', { state: 'detached', timeout: 15000 });
  await page.waitForSelector('#isbar-accordion-add > .isbar-section', { state: 'attached', timeout: 15000 });
}

// The Active Patients table on Page A is collapsed by default (2026-09-22
// redesign) — tests that need to search/interact with it must expand it first.
async function expandActivePatients(page) {
  const btn = page.locator('#pat-dataset-toggle-btn');
  if ((await btn.getAttribute('aria-expanded')) !== 'true') await btn.click();
  await page.waitForSelector('#pat-dataset-body:not([hidden])');
}

async function gotoStatistics(page) {
  await page.click('.nav-btn[data-section="statistics"]');
  await page.waitForSelector('#statistics.section.active');
}

// ER Live-Roster Redesign, slice ER8/ER12 — Beds Display (now the Live ER
// Board, ER UI Architecture Redesign Page B) lives under the "Care"
// nav-group dropdown (desktop), not a direct top-level nav-btn.
async function gotoBedsDisplay(page) {
  await page.click('#navg-care-btn');
  await page.click('#navg-care-dd .nav-dd-item[data-section="beds-display"]');
  await page.waitForSelector('#beds-display.section.active');
  await page.waitForSelector('#erb-lanes .loading', { state: 'detached', timeout: 15000 });
  await page.waitForSelector('#erb-lanes .erb-lane', { state: 'attached', timeout: 15000 });
}

// Collects any browser console "error" messages emitted while `fn` runs.
async function collectConsoleErrors(page, fn) {
  const errors = [];
  const handler = (msg) => { if (msg.type() === 'error') errors.push(msg.text()); };
  page.on('console', handler);
  try {
    await fn();
  } finally {
    page.off('console', handler);
  }
  return errors;
}

module.exports = { login, gotoPatients, expandActivePatients, gotoStatistics, gotoBedsDisplay, collectConsoleErrors };
