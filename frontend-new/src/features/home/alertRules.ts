import type { ErRosterItem } from '@/types/er'
import type { Patient } from '@/types/patient'
import { NEW_PATIENT_NO_ISBAR_MINUTES, OCCUPANCY_HIGH_PCT, OCCUPANCY_WARNING_PCT, ROSTER_STALE_MINUTES } from './constants'

export type AlertSeverity = 'info' | 'warning' | 'critical'

export interface OperationalAlert {
  id: string
  severity: AlertSeverity
  message: string
}

/**
 * Alert Type 1 (Dashboard spec §9's Alert Type 1): a roster patient with no
 * matching active HCopilot stay (by er_visit_id — same matching key
 * LiveErRoster already uses) who arrived more than
 * NEW_PATIENT_NO_ISBAR_MINUTES ago.
 */
export function findPatientsAwaitingIsbar(rosterItems: ErRosterItem[], activePatients: Patient[], now: Date): ErRosterItem[] {
  const activeVisitIds = new Set(activePatients.filter((p) => p.er_visit_id).map((p) => String(p.er_visit_id)))
  return rosterItems.filter((item) => {
    if (activeVisitIds.has(String(item.er_visit_id))) return false
    if (!item.arrival_time) return false
    const arrival = new Date(item.arrival_time).getTime()
    if (Number.isNaN(arrival)) return false
    const minutesWaiting = (now.getTime() - arrival) / 60000
    return minutesWaiting > NEW_PATIENT_NO_ISBAR_MINUTES
  })
}

/** Alert Type 2: occupancy_rate is already a 0-100 percentage from GET /api/beds/stats. */
export function classifyOccupancy(occupancyRatePercent: number): AlertSeverity | null {
  if (occupancyRatePercent >= OCCUPANCY_HIGH_PCT) return 'critical'
  if (occupancyRatePercent >= OCCUPANCY_WARNING_PCT) return 'warning'
  return null
}

/**
 * Alert Type 3 (freshness half): `lastUpdatedAt` is TanStack Query's real
 * `dataUpdatedAt` for the roster query — the actual last successful fetch,
 * not a fabricated timestamp.
 */
export function isRosterStale(lastUpdatedAt: number | undefined, now: Date): boolean {
  if (!lastUpdatedAt) return false
  const minutesSinceUpdate = (now.getTime() - lastUpdatedAt) / 60000
  return minutesSinceUpdate > ROSTER_STALE_MINUTES
}
