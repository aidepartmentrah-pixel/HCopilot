import type { ISBARBadgeSubset, ISBARDetails } from './isbar'

/** ESI triage scale: 1 = Immediate, 5 = Non-Urgent. */
export type AcuityLevel = 1 | 2 | 3 | 4 | 5

/**
 * An active stay row — mirrors patient_management/api.py's _PatientBase +
 * PatientCreate, and DailyPatient's real columns (GET /api/patients/{id}/details).
 * Gender/age/acuity/chiefcomplaint are nullable: a roster-origin stay
 * (record_source "external" + er_visit_id) legitimately has none of them at
 * creation — see check_required_by_origin in the backend. Don't add
 * client-side "required" validation for these beyond what the backend
 * actually enforces.
 */
export interface Patient {
  patient_id: number
  stay_id: number
  name: string
  gender?: string | null
  age?: number | null
  arrival_time: string
  departure_time?: string | null
  bed_occupation_time?: string | null
  temperature?: number | null
  heartrate?: number | null
  resprate?: number | null
  o2sat?: number | null
  sbp?: number | null
  dbp?: number | null
  pain?: string | null
  acuity?: AcuityLevel | null
  chiefcomplaint?: string | null
  external_patient_id?: string | null
  external_visit_id?: string | null
  record_source?: 'local' | 'external' | null
  er_visit_id?: string | null
  triage_time?: string | null
  isbar?: ISBARBadgeSubset | null
}

/** GET /api/patients/{stay_id}/details — full record, including every ISBAR field. */
export interface PatientDetails extends Patient {
  bed_history?: string | null
  admission_ward_id?: number | null
  admission_ward_name?: string | null
  destination?: string | null
  source: 'daily' | 'log'
  departure_source?: string | null
  isbar: ISBARDetails | null
}

/** POST /api/patients/add body. */
export interface PatientCreateInput {
  patient_id: number
  stay_id: number
  name: string
  arrival_time: string
  gender?: string
  age?: number
  chiefcomplaint?: string
  acuity?: AcuityLevel
  temperature?: number
  heartrate?: number
  resprate?: number
  o2sat?: number
  sbp?: number
  dbp?: number
  pain?: string
  bed_occupation_time?: string
  departure_time?: string
  external_patient_id?: string
  external_visit_id?: string
  record_source?: 'local' | 'external'
  er_visit_id?: string
  triage_time?: string
  isbar?: ISBARDetails
}

/** PUT /api/patients/modify/{stay_id} body — same shape minus stay_id (it's in the URL). */
export type PatientModifyInput = Omit<PatientCreateInput, 'stay_id'>

export interface PatientListResponse {
  patients: Patient[]
  total: number
}

export interface NextIds {
  next_patient_id: number
  next_stay_id: number
}
