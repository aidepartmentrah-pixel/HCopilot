import { BedDouble, BookUser, BrainCircuit, Building2, Stethoscope, UsersRound, UserRound } from 'lucide-react'
import type { ComponentType } from 'react'

export interface SettingsNavItem {
  id: string
  label: string
  icon: ComponentType<{ size?: number }>
  /** `settings_tabs` keys that open this area (any one is enough); admins always can. */
  tabKeys?: readonly string[]
  /** Only administrators (the old UI's "accounts" tab has no key of its own). */
  adminOnly?: boolean
}

export interface SettingsNavGroup {
  label: string
  items: SettingsNavItem[]
}

/**
 * V2.6 IA (spec §2/§39/§52) — left sidebar, three groups. Reset is gone
 * completely (§3/§38, see V2.6 log for the DangerZone removal); no
 * generic Patients/Scheduling/Data tab (§6–§8, all three real old
 * capabilities inspected and found to belong elsewhere or nowhere — see
 * log); no General item (§10 — no real application-wide config exists in
 * the backend to put there, confirmed by inspection, so it's omitted
 * rather than shipped empty per §8's "do not introduce generic empty
 * categories" applied the same way).
 */
export const SETTINGS_NAV: SettingsNavGroup[] = [
  {
    label: 'Resources',
    items: [
      { id: 'beds', label: 'Beds', icon: BedDouble, tabKeys: ['beds'] },
      { id: 'doctors', label: 'Doctors', icon: Stethoscope, tabKeys: ['doctors'] },
      { id: 'nurses', label: 'Nurses', icon: UserRound, tabKeys: ['nurses'] },
      { id: 'wards', label: 'Wards', icon: Building2, tabKeys: ['wards'] },
    ],
  },
  {
    label: 'System',
    items: [
      { id: 'integrations', label: 'Integrations', icon: BookUser, tabKeys: ['hospital-directory'] },
      { id: 'ai-models', label: 'AI & Models', icon: BrainCircuit, tabKeys: ['models', 'training'] },
    ],
  },
  {
    label: 'Access',
    items: [{ id: 'accounts', label: 'Accounts & Permissions', icon: UsersRound, adminOnly: true }],
  },
]
