import type { Page } from '@playwright/test'

/** The Active Patients table is collapsed by default (2026-10-01) - expand it before touching its rows. */
export async function expandActivePatients(page: Page) {
  const toggle = page.getByRole('button', { name: /Active Patients/ })
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
}
