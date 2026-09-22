import type { StatusTone } from '@/components/ui/StatusBadge'
import type { Bed } from '@/types/bed'
import type { BedlessPatient } from '@/types/bed'

export interface PlacementCardData {
  id: string
  kind: 'bed' | 'waiting'
  statusTone: StatusTone
  statusLabel: string
  primary: string
  sub: string
  acuity?: number | null
  isWaitingOverThreshold: boolean
  bed?: Bed
  patient?: BedlessPatient
}

const WAITING_THRESHOLD_MINUTES = 5

/** Confirmed decision (ER UI Architecture Redesign): "handled" = triage_time set. */
export function isWaitingOverThreshold(arrivalTime: string, triageTime: string | null): boolean {
  if (triageTime) return false
  const arrival = new Date(arrivalTime).getTime()
  if (Number.isNaN(arrival)) return false
  const minutesWaiting = (Date.now() - arrival) / 60000
  return minutesWaiting > WAITING_THRESHOLD_MINUTES
}

/** Same shared shape a bed row and a bedless-patient row both normalize into — one card renderer for both (§21). */
export function cardFromBed(bed: Bed): PlacementCardData {
  const tone: StatusTone = bed.bed_status === 'Available' ? 'success' : bed.bed_status === 'Occupied' ? 'occupied' : 'warning'
  return {
    id: `bed-${bed.bed_id}`,
    kind: 'bed',
    statusTone: tone,
    statusLabel: bed.bed_status,
    primary: `Bed ${bed.bed_number}`,
    sub: bed.patient_name
      ? [bed.patient_name, [bed.patient_age != null ? `${bed.patient_age}y` : null, bed.patient_gender].filter(Boolean).join(' ')]
          .filter(Boolean)
          .join(' · ')
      : '',
    isWaitingOverThreshold: false,
    bed,
  }
}

export function cardFromBedless(patient: BedlessPatient): PlacementCardData {
  return {
    id: `waiting-${patient.stay_id}`,
    kind: 'waiting',
    statusTone: 'waiting',
    statusLabel: 'Waiting',
    primary: patient.name,
    sub: patient.chiefcomplaint || '',
    acuity: patient.acuity,
    isWaitingOverThreshold: isWaitingOverThreshold(patient.arrival_time, patient.triage_time),
    patient,
  }
}
