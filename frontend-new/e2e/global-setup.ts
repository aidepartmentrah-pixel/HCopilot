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

export default async function globalSetup() {
  const requestContext = await playwrightRequest.newContext({ baseURL: BACKEND_URL })
  const response = await requestContext.post('/api/auth/login', {
    data: { username: 'admin', password: 'admin' },
  })
  if (!response.ok()) {
    throw new Error(`e2e global setup: /api/auth/login failed (${response.status()}): ${await response.text()}`)
  }
  const { user } = (await response.json()) as { user: unknown }
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
