import type { AcuityLevel } from './patient'

export type BedCondition = 'Available' | 'Under Repair'
export type BedStatus = 'Available' | 'Occupied' | 'Under Repair'
export type BedType = string // backend's _VALID_TYPES set — treated as an open string, see NF7 for the real allow-list surfaced in the admin form

/** One row from GET /api/beds/list. */
export interface Bed {
  bed_id: number
  bed_number: string
  bed_condition: BedCondition
  bed_status: BedStatus
  bed_type: BedType
  ward_id: number | null
  ward_name: string | null
  patient_id: number | null
  patient_name: string | null
  patient_gender: string | null
  patient_age: number | null
}

export interface BedListResponse {
  beds: Bed[]
  total_beds: number
  status_summary: Record<BedStatus, number>
}

export interface BedStats {
  total_beds: number
  occupied: number
  available: number
  under_repair: number
  occupancy_rate: number
  total_wards: number
  type_summary: Record<string, number>
}

/** One row from GET /api/beds/bedless — an active stay with no bed relation yet. */
export interface BedlessPatient {
  subject_id: number
  stay_id: number
  name: string
  gender: string | null
  age: number | null
  temperature: number | null
  heartrate: number | null
  resprate: number | null
  o2sat: number | null
  sbp: number | null
  dbp: number | null
  pain: string | null
  acuity: AcuityLevel | null
  chiefcomplaint: string | null
  arrival_time: string
  triage_time: string | null
  er_visit_id: string | null
  unurgent: boolean
  doctor_ids: number[]
  nurse_ids: number[]
}

export interface BedlessResponse {
  patients: BedlessPatient[]
  total: number
}

export interface BedCreateInput {
  bed_number: string
  ward_id?: number
  bed_type?: string
}

export interface BedDischargeInput {
  departure_time?: string
  destination?: string
}
