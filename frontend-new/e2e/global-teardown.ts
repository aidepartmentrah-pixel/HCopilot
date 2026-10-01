import fs from 'node:fs'
import { request as playwrightRequest } from '@playwright/test'
import { ROSTER_PRIOR_STATE_PATH } from './global-setup'

// Put the admin "Live ER roster" switch back the way global-setup found it.
const BACKEND_URL = process.env.VITE_DEV_PROXY_TARGET ?? 'http://localhost:8090'

export default async function globalTeardown() {
  if (!fs.existsSync(ROSTER_PRIOR_STATE_PATH)) return
  const { er_roster_enabled } = JSON.parse(fs.readFileSync(ROSTER_PRIOR_STATE_PATH, 'utf8')) as { er_roster_enabled: boolean }
  fs.rmSync(ROSTER_PRIOR_STATE_PATH)
  if (er_roster_enabled) return // it was already on — nothing to restore
  const requestContext = await playwrightRequest.newContext({ baseURL: BACKEND_URL })
  await requestContext.post('/api/hospital-directory/config/er-roster/enable', { data: { enabled: false } })
  await requestContext.dispose()
}
