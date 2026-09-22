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
  // `fullyParallel: false` only serializes tests WITHIN one file — different
  // spec files still ran concurrently by default (3 workers), which raced on
  // /api/patients/next-ids (a bare max(existing)+1 with no locking, see
  // patient_manager.py) once a 4th+ spec file was added (ER Live-Roster
  // Redesign, slice ER12 testing) — two workers could read the same "next"
  // id before either committed, so one add() 400'd on a collision. Forcing
  // one worker actually delivers this config's own stated intent above.
  workers: 1,
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
