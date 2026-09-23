/**
 * `sections`/`settings_tabs` are comma-separated key strings shared with
 * the OLD frontend's own permission enforcement (`frontend/js/auth.js`
 * matches these exact literal keys against `NAV_GROUPS`/`STAB_GROUPS` to
 * hide nav for a shared Users table). The new frontend's Accounts editor
 * must therefore only ever toggle real, existing keys — inventing new
 * vocabulary here would silently break the old frontend's nav gating for
 * any account both frontends share. Confirmed real key set via
 * `users_manager.py`'s `ALL_SECTIONS`/`ALL_SETTINGS_TABS` constants plus a
 * live `/api/auth/users` read (which also surfaced `patient-history` — a
 * real, in-use key for the old frontend's own History-equivalent page,
 * missing from `ALL_SECTIONS` because that constant is only the
 * admin-auto-fill default, not a hard whitelist).
 */
export interface PermissionOption {
  key: string
  label: string
}

export const SECTION_PERMISSIONS: PermissionOption[] = [
  { key: 'home', label: 'Home' },
  { key: 'patients', label: 'ER ISBAR Entry' },
  { key: 'beds-display', label: 'Live ER' },
  { key: 'patient-history', label: 'History' },
  { key: 'statistics', label: 'Statistics' },
  { key: 'flow-prediction', label: 'Predictions' },
  { key: 'settings', label: 'Settings' },
]

/**
 * No real backend key exists for "Integrations" or "Accounts &
 * Permissions" sub-areas (`ALL_SETTINGS_TABS` only covers Resources +
 * Model Registry/Training) — a named, logged backend gap (V2.6 log),
 * not fabricated here.
 */
export const SETTINGS_TAB_PERMISSIONS: PermissionOption[] = [
  { key: 'beds', label: 'Beds' },
  { key: 'doctors', label: 'Doctors' },
  { key: 'nurses', label: 'Nurses' },
  { key: 'wards', label: 'Wards' },
  { key: 'models', label: 'Model Registry' },
  { key: 'training', label: 'Training' },
]

export function parseKeys(csv: string): Set<string> {
  return new Set(
    csv
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
}

export function serializeKeys(keys: Set<string>): string {
  return Array.from(keys).join(',')
}

export function hasKey(csv: string, key: string): boolean {
  return parseKeys(csv).has(key)
}

/** Toggles exactly one key, preserving every other key already present — including ones this editor renders no checkbox for (e.g. `scheduling`/`simulation`, real old-frontend-only keys) — so editing one permission never silently drops another (§31 "do not fabricate capabilities" cuts both ways: never invent, never delete real ones either). */
export function toggleKey(csv: string, key: string, enabled: boolean): string {
  const keys = parseKeys(csv)
  if (enabled) keys.add(key)
  else keys.delete(key)
  return serializeKeys(keys)
}

/**
 * Grants every checkbox-represented key, preserving whatever else was
 * already present. Mirrors the backend's own `settings_tabs`/
 * `statistics_tabs` admin auto-fill (`users_manager.py`'s `_row()`) — but
 * `sections` has no such backfill there, so an admin created with an
 * empty `sections` string would otherwise have zero nav access in the old
 * frontend, a real contradictory "Admin but no access" state §32
 * explicitly says not to allow. Applied client-side to both fields for
 * consistency when the role toggle is set to Admin.
 */
export function grantAllKnownKeys(csv: string, options: PermissionOption[]): string {
  const keys = parseKeys(csv)
  for (const opt of options) keys.add(opt.key)
  return serializeKeys(keys)
}
