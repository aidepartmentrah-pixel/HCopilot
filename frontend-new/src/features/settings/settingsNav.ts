import { AlertOctagon, BedDouble, Stethoscope, UserRound, Building2 } from 'lucide-react'
import type { ComponentType } from 'react'

export interface SettingsNavItem {
  id: string
  label: string
  icon: ComponentType<{ size?: number }>
}

export interface SettingsNavGroup {
  label: string
  items: SettingsNavItem[]
}

/**
 * Real current settings tabs, audited from frontend/js/auth.js's own
 * HCOPILOT_SETTINGS_TABS (not guessed) — scoped to the "Resources" group
 * plus Danger Zone this phase. Scheduling (Shifts/Groups), Patients
 * (Daily/Log — already covered by this rewrite's own ISBAR/History
 * pages), Data (Datasets/Relations), and System (Models/Training/
 * Features/Hospital Directory API) are real, existing tabs left out of
 * this pass — named here, not silently dropped — because they belong to
 * modules (Flow Prediction/ML training, dataset admin) outside this
 * rewrite's declared scope (master prompt's 5 pages), same boundary
 * NF1.3 already drew for top-level nav.
 */
export const SETTINGS_NAV: SettingsNavGroup[] = [
  {
    label: 'Resources',
    items: [
      { id: 'beds', label: 'Beds', icon: BedDouble },
      { id: 'doctors', label: 'Doctors', icon: Stethoscope },
      { id: 'nurses', label: 'Nurses', icon: UserRound },
      { id: 'wards', label: 'Wards', icon: Building2 },
    ],
  },
  {
    label: 'Danger Zone',
    items: [{ id: 'reset', label: 'Reset', icon: AlertOctagon }],
  },
]
