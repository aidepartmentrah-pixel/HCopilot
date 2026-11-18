import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { request as playwrightRequest } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// V2.0 gates the whole app behind a real session (AuthProvider), which
// would otherwise force every existing e2e spec to click through a login
// form before doing anything. Instead: log in once here, directly against
// the real backend (bypassing the frontend proxy entirely so this doesn't
// depend on webServer readiness ordering), and hand every test a
// pre-authenticated storageState — the same seeded admin/admin account
// users_manager.py auto-creates on first run.
const BACKEND_URL = process.env.VITE_DEV_PROXY_TARGET ?? 'http://localhost:8090'
const FRONTEND_ORIGIN = 'http://localhost:8083'
export const STORAGE_STATE_PATH = path.join(__dirname, '.auth', 'admin.json')
export const ROSTER_PRIOR_STATE_PATH = path.join(__dirname, '.auth', 'roster-prior-state.json')

export default async function globalSetup() {
  const requestContext = await playwrightRequest.newContext({ baseURL: BACKEND_URL })
  const response = await requestContext.post('/api/auth/login', {
    data: { username: 'admin', password: 'admin' },
  })
  if (!response.ok()) {
    throw new Error(`e2e global setup: /api/auth/login failed (${response.status()}): ${await response.text()}`)
  }
  const { user } = (await response.json()) as { user: unknown }

  // Specs that exercise the live ER roster need the admin "Live ER roster" switch ON (it ships OFF
  // so HCopilot can run against a directory API that predates /er/current-visits). Remember the
  // prior state so global-teardown can restore it — the dev switch isn't left changed by a test run.
  const config = (await (await requestContext.get('/api/hospital-directory/config')).json()) as {
    er_roster_enabled?: boolean
    er_configured?: boolean
  }
  // Since 3iSoft's v1.2 delivery the roster comes from a SEPARATE ER API (own URL + key). If this backend has none
  // saved yet, configure it from E2E_ER_BASE_URL / E2E_ER_API_KEY when given (e.g. the v1.2 mock on port 6001).
  if (!config.er_configured && process.env.E2E_ER_BASE_URL) {
    await requestContext.post('/api/hospital-directory/config/er-roster/save', {
      data: { er_base_url: process.env.E2E_ER_BASE_URL, er_api_key: process.env.E2E_ER_API_KEY ?? 'dev-secret-key' },
    })
  }
  fs.mkdirSync(path.dirname(ROSTER_PRIOR_STATE_PATH), { recursive: true })
  fs.writeFileSync(ROSTER_PRIOR_STATE_PATH, JSON.stringify({ er_roster_enabled: !!config.er_roster_enabled }))
  if (!config.er_roster_enabled) {
    const enable = (await (await requestContext.post('/api/hospital-directory/config/er-roster/enable', { data: { enabled: true } })).json()) as {
      success: boolean
      message: string
    }
    if (!enable.success) {
      // No usable ER API (not configured, wrong key, unreachable) — roster-dependent specs will fail; say why.
      console.warn(`e2e global setup: could not enable the Live ER roster (${enable.message}) — roster specs need the v1.2 ER API (set E2E_ER_BASE_URL).`)
    }
  }

  await requestContext.dispose()

  fs.mkdirSync(path.dirname(STORAGE_STATE_PATH), { recursive: true })
  fs.writeFileSync(
    STORAGE_STATE_PATH,
    JSON.stringify({
      cookies: [],
      origins: [
        {
          origin: FRONTEND_ORIGIN,
          localStorage: [{ name: 'hcopilot_session', value: JSON.stringify(user) }],
        },
      ],
    }),
  )
}
