import { defineConfig, devices } from '@playwright/test'

// Separate Playwright project from frontend/tests/ (which keeps covering the
// old frontend) — see New Frontend Slicing Table, "Testing design".
export default defineConfig({
  testDir: './e2e',
  // Tests share one real backend/DB, same as frontend/playwright.config.js's
  // own precedent — /api/patients/next-ids is a bare max(existing)+1 with no
  // locking (patient_manager.py), so concurrent workers can read the same
  // "next" id before either commits, 400ing one add() on a collision.
  // Confirmed live: the ISBAR create-on-pick tests failed intermittently
  // under fullyParallel/multi-worker, passed 100% reliably at workers: 1.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  // V2.0 added a real login gate (AuthProvider) — global-setup.ts signs in
  // once against the real backend and every test starts already
  // authenticated via storageState, so this doesn't ripple into every
  // existing spec file. A signed-out state (e.g. to test the login form
  // itself) is opted into per-test with `test.use({ storageState: {
  // cookies: [], origins: [] } })` — see e2e/shell.spec.ts.
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:8083',
    storageState: './e2e/.auth/admin.json',
    trace: 'on-first-retry',
  },
  expect: {
    toHaveScreenshot: {
      // Real ER data (roster/beds/waiting counts) genuinely changes
      // between the baseline-capture run and any later comparison run,
      // even with explicit masks on the volatile regions — a small
      // tolerance absorbs that live-data noise without hiding a real
      // layout/design regression (masked regions still can't drift more
      // than this before failing).
      maxDiffPixelRatio: 0.02,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:8083',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
