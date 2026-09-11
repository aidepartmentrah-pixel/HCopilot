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

async function gotoStatistics(page) {
  await page.click('.nav-btn[data-section="statistics"]');
  await page.waitForSelector('#statistics.section.active');
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

module.exports = { login, gotoPatients, gotoStatistics, collectConsoleErrors };
