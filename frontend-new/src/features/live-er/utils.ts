import type { StatusTone } from '@/components/ui/StatusBadge'
import type { Bed } from '@/types/bed'
import type { BedlessPatient } from '@/types/bed'
import { formatWaitingDuration, minutesSinceArrival } from './durationFormat'

export interface PlacementCardData {
  id: string
  kind: 'bed' | 'waiting'
  statusTone: StatusTone
  statusLabel: string
  primary: string
  sub: string
  patientId?: number | null
  bedType?: string | null
  acuity?: number | null
  waitingMinutes?: number | null
  /** Which avatar a waiting card shows. */
  avatar?: AvatarKind
  isWaitingOverThreshold: boolean
  bed?: Bed
  patient?: BedlessPatient
}

const WAITING_THRESHOLD_MINUTES = 5

/** 18 is the standard adult/pediatric ED cutoff (same as the legacy board). */
const ADULT_AGE = 18

export type AvatarKind = 'man' | 'woman' | 'boy' | 'girl' | 'neutral' | 'neutral-child'

/** Which avatar a waiting patient gets; neutral when gender is unknown, child when age is known and under 18. */
export function avatarKind(gender: string | null | undefined, age: number | null | undefined): AvatarKind {
  const isChild = age != null && age < ADULT_AGE
  const g = (gender ?? '').trim().toLowerCase()
  if (g === 'male') return isChild ? 'boy' : 'man'
  if (g === 'female') return isChild ? 'girl' : 'woman'
  return isChild ? 'neutral-child' : 'neutral'
}

/**
 * §5 fix: the old label conflated "not yet triaged" with "waiting for a
 * bed" — two different conditions. `useBedlessPatients` already only
 * returns patients currently without a bed, so *this* page's "waiting"
 * concept is real elapsed time without a bed, regardless of triage
 * status (a triaged patient can still wait a long time for a bed to open
 * up). The "new patient, ISBAR not started" concept is a different alert
 * that belongs to Home's OperationalAlertsPanel (V2.1), not here.
 */
export function isOverAttentionThreshold(minutes: number | null): boolean {
  return minutes != null && minutes > WAITING_THRESHOLD_MINUTES
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
    patientId: bed.patient_id,
    bedType: bed.bed_type,
    isWaitingOverThreshold: false,
    bed,
  }
}

export function cardFromBedless(patient: BedlessPatient, now: Date = new Date()): PlacementCardData {
  const minutes = minutesSinceArrival(patient.arrival_time, now)
  return {
    id: `waiting-${patient.stay_id}`,
    kind: 'waiting',
    statusTone: 'waiting',
    statusLabel: 'Waiting',
    primary: patient.name,
    sub: patient.chiefcomplaint || '',
    patientId: patient.subject_id,
    acuity: patient.acuity,
    waitingMinutes: minutes,
    avatar: avatarKind(patient.gender, patient.age),
    isWaitingOverThreshold: isOverAttentionThreshold(minutes),
    patient,
  }
}

export { formatWaitingDuration }
