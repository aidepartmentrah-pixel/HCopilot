import type { LogPatient } from '@/types/history'
import type { Patient } from '@/types/patient'

export type RecentActivityEvent = 'Patient Arrived' | 'Bed Assigned' | 'Discharged'

export interface RecentActivityItem {
  id: string
  time: string
  patientName: string
  event: RecentActivityEvent
}

const DEFAULT_LIMIT = 6

/**
 * Derived only from timestamps HCopilot already has (Dashboard spec §8) —
 * no new event-log table. Deliberately just these 3 events: there is no
 * discrete "ISBAR started" or "bed changed" timestamp in the data model
 * (checked isbar.ts/patient.ts/history.ts), so those from the spec's
 * example list are left out rather than approximated.
 */
export function buildRecentActivity(activePatients: Patient[], dischargedPatients: LogPatient[], limit = DEFAULT_LIMIT): RecentActivityItem[] {
  const items: RecentActivityItem[] = []

  for (const p of activePatients) {
    if (p.arrival_time) items.push({ id: `arrival-${p.stay_id}`, time: p.arrival_time, patientName: p.name, event: 'Patient Arrived' })
    if (p.bed_occupation_time) items.push({ id: `bed-${p.stay_id}`, time: p.bed_occupation_time, patientName: p.name, event: 'Bed Assigned' })
  }

  for (const p of dischargedPatients) {
    if (p.departure_time) items.push({ id: `discharge-${p.stay_id}`, time: p.departure_time, patientName: p.name, event: 'Discharged' })
  }

  return items
    .filter((item) => !Number.isNaN(new Date(item.time).getTime()))
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, limit)
}
