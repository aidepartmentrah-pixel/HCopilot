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

/**
 * Alert Type 3 (availability half): what, if anything, to tell the user about
 * the roster feed itself. `roster_off` (the admin switch is off — the normal
 * state on a v1.1 directory API) is deliberately silent: no "unavailable"
 * warning and no staleness warning, because nothing is being polled.
 */
export function rosterFeedAlert(
  roster: { status: string; message?: string } | undefined,
  isError: boolean,
  lastUpdatedAt: number | undefined,
  now: Date,
): OperationalAlert | null {
  if (roster?.status === 'roster_off') return null
  if (isError) return { id: 'roster-unavailable', severity: 'critical', message: 'ER roster connection unavailable.' }
  if (roster && roster.status !== 'ok') {
    return { id: 'roster-unavailable', severity: 'warning', message: roster.message || 'Hospital Directory is temporarily unreachable.' }
  }
  if (isRosterStale(lastUpdatedAt, now)) return { id: 'roster-stale', severity: 'warning', message: 'ER roster has not updated in over 8 minutes.' }
  return null
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
