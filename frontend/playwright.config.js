// playwright.config.js — HCopilot frontend E2E tests.
//
// Assumes `docker compose up` is already running (sqlserver + backend +
// frontend) — this is the app's only supported execution path, so tests
// point at the already-running frontend rather than starting a second
// serving mechanism just for tests. No webServer block: if the stack isn't
// up, tests fail fast with a connection error rather than silently spinning
// up something different from what the app actually runs on.
//
// Single fixed desktop viewport (1440x900) — the "main supported desktop
// resolution" per the task's testing requirements; this app has no
// responsive breakpoints tuned for mobile.

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  expect: { timeout: 5000 },
  fullyParallel: false, // tests share one backend/DB — avoid cross-test data races
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:8082',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
