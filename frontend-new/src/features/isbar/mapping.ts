import type { NextIds, PatientCreateInput, PatientDetails, PatientModifyInput } from '@/types/patient'
import type { IsbarFormValues } from './schema'

const EMPTY_ISBAR: IsbarFormValues['isbar'] = {}

/** Build a fresh draft's default values — a not-yet-created stay, pre-filled with the next available IDs. */
export function emptyDraftValues(nextIds: NextIds): IsbarFormValues {
  return {
    patient_id: nextIds.next_patient_id,
    stay_id: nextIds.next_stay_id,
    name: '',
    arrival_time: toDatetimeLocal(new Date().toISOString()),
    gender: '',
    age: undefined,
    chiefcomplaint: '',
    acuity: undefined,
    temperature: undefined,
    heartrate: undefined,
    resprate: undefined,
    o2sat: undefined,
    sbp: undefined,
    dbp: undefined,
    pain: '',
    triage_time: '',
    record_source: 'local',
    er_visit_id: '',
    isbar: EMPTY_ISBAR,
  }
}

/** Build form default values from an existing stay's full record (GET /api/patients/{id}/details). */
export function patientDetailsToFormValues(patient: PatientDetails): IsbarFormValues {
  return {
    patient_id: patient.patient_id,
    stay_id: patient.stay_id,
    name: patient.name ?? '',
    arrival_time: toDatetimeLocal(patient.arrival_time),
    gender: patient.gender ?? '',
    age: patient.age ?? undefined,
    chiefcomplaint: patient.chiefcomplaint ?? '',
    acuity: patient.acuity ?? undefined,
    temperature: patient.temperature ?? undefined,
    heartrate: patient.heartrate ?? undefined,
    resprate: patient.resprate ?? undefined,
    o2sat: patient.o2sat ?? undefined,
    sbp: patient.sbp ?? undefined,
    dbp: patient.dbp ?? undefined,
    pain: patient.pain ?? '',
    triage_time: toDatetimeLocal(patient.triage_time),
    record_source: (patient.record_source as 'local' | 'external' | undefined) ?? 'local',
    er_visit_id: patient.er_visit_id ?? '',
    isbar: {
      ...nullsToUndefined(patient.isbar),
      vitals_measured_at: toDatetimeLocal(patient.isbar?.vitals_measured_at),
      recent_procedure_datetime: toDatetimeLocal(patient.isbar?.recent_procedure_datetime),
      last_bowel_movement: toDatetimeLocal(patient.isbar?.last_bowel_movement),
      handover_datetime: toDatetimeLocal(patient.isbar?.handover_datetime),
    },
  }
}

export function formValuesToCreateInput(values: IsbarFormValues): PatientCreateInput {
  return {
    ...stripEmpty(values),
    stay_id: values.stay_id,
  } as PatientCreateInput
}

export function formValuesToModifyInput(values: IsbarFormValues): PatientModifyInput {
  const { stay_id: _stayId, ...rest } = stripEmpty(values)
  return rest as PatientModifyInput
}

/** Empty strings from untouched optional inputs shouldn't overwrite stored values with "" (§ exclude_unset parallel on the client side). */
function stripEmpty(values: IsbarFormValues): Omit<IsbarFormValues, 'isbar'> & { isbar: IsbarFormValues['isbar'] } {
  const clean = { ...values }
  for (const key of Object.keys(clean) as (keyof typeof clean)[]) {
    if (clean[key] === '') {
      delete clean[key]
    }
  }
  const isbar = { ...clean.isbar }
  for (const key of Object.keys(isbar) as (keyof typeof isbar)[]) {
    if (isbar[key] === '') {
      delete isbar[key]
    }
  }
  clean.isbar = isbar
  return clean
}

/** Shallow null→undefined, so `T | null` API fields fit the form's `T | undefined` shape (HTML inputs can't take `null`). */
type NoNulls<T> = { [K in keyof T]?: Exclude<T[K], null> }

function nullsToUndefined<T extends object>(obj: T | null | undefined): NoNulls<T> {
  if (!obj) return {}
  const result: NoNulls<T> = {}
  for (const key of Object.keys(obj) as (keyof T)[]) {
    const value = obj[key]
    result[key] = (value ?? undefined) as NoNulls<T>[keyof T]
  }
  return result
}

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  // Accepts either a full ISO string or an already-"datetime-local"-shaped
  // string (YYYY-MM-DDTHH:mm) — trims seconds/offset either way.
  return iso.slice(0, 16)
}
