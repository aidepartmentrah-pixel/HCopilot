import type { ISBARBadgeSubset } from './isbar'
import type { AcuityLevel } from './patient'

/** A discharged stay — GET /api/data/log-patients/list. Same core shape as Patient plus discharge fields. */
export interface LogPatient {
  subject_id: number
  stay_id: number
  name: string
  gender: string | null
  age: number | null
  arrival_time: string
  departure_time: string | null
  bed_occupation_time: string | null
  destination: string | null
  bed_history: string | null
  admission_ward_id: number | null
  admission_ward_name: string | null
  temperature: number | null
  heartrate: number | null
  resprate: number | null
  o2sat: number | null
  sbp: number | null
  dbp: number | null
  pain: string | null
  acuity: AcuityLevel | null
  chiefcomplaint: string | null
  external_patient_id: string | null
  external_visit_id: string | null
  record_source: 'local' | 'external' | null
  er_visit_id: string | null
  triage_time: string | null
  departure_source: string | null
  isbar?: ISBARBadgeSubset | null
}

export interface LogPatientListResponse {
  patients: LogPatient[]
  total: number
}
