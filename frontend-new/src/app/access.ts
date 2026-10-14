import type { AuthUser } from '@/types/auth'
import { hasKey } from '@/features/settings/permissions'

/**
 * Per-user page access — the new UI's counterpart of the old frontend's `canAccess()` (frontend/js/auth.js),
 * reading the same comma-separated `sections` / `settings_tabs` strings, so an account limited in one UI is
 * limited in the other. Rules are deliberately identical to the old UI:
 *   - admins can open everything;
 *   - Home is always open;
 *   - everyone else sees only the sections listed in their `sections`;
 *   - Settings sub-areas additionally need the `settings` section AND the matching `settings_tabs` key.
 *
 * Note: like the old UI, this hides and blocks screens in the browser — the API itself is not authenticated.
 */

/** New-UI page → the section key stored on the account (keys are the old UI's, shared by both UIs). */
export const SECTION_KEYS = {
  home: 'home',
  isbar: 'patients',
  liveEr: 'beds-display',
  history: 'patient-history',
  statistics: 'statistics',
  predictions: 'flow-prediction',
  settings: 'settings',
} as const

export type SectionKey = (typeof SECTION_KEYS)[keyof typeof SECTION_KEYS]

export function isAdmin(user: AuthUser | null): boolean {
  return user?.role === 'admin'
}

export function canAccessSection(user: AuthUser | null, key: SectionKey): boolean {
  if (!user) return false
  if (key === SECTION_KEYS.home || isAdmin(user)) return true
  return hasKey(user.sections, key)
}

/** A Settings sub-area is open to admins, or to users with the Settings section plus ANY of the given tab keys. */
export function canAccessSettingsArea(user: AuthUser | null, tabKeys: readonly string[]): boolean {
  if (!user) return false
  if (isAdmin(user)) return true
  if (!hasKey(user.sections, SECTION_KEYS.settings)) return false
  return tabKeys.some((k) => hasKey(user.settings_tabs, k))
}
