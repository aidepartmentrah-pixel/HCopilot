import { describe, expect, it } from 'vitest'
import type { LogPatient } from '@/types/history'
import { collectBedOptions, emptyHistoryFilters, filterHistory } from './utils'

function makePatient(overrides: Partial<LogPatient>): LogPatient {
  return {
    subject_id: 1,
    stay_id: 100,
    name: 'Wilson, Emily',
    gender: 'Female',
    age: 28,
    arrival_time: '2026-06-01T10:00',
    departure_time: '2026-06-01T14:00',
    bed_occupation_time: null,
    destination: 'Home',
    bed_history: '101,102',
    admission_ward_id: null,
    admission_ward_name: null,
    temperature: null,
    heartrate: null,
    resprate: null,
    o2sat: null,
    sbp: null,
    dbp: null,
    pain: null,
    acuity: 3,
    chiefcomplaint: 'Abdominal pain',
    external_patient_id: null,
    external_visit_id: null,
    record_source: null,
    er_visit_id: null,
    triage_time: null,
    departure_source: null,
    ...overrides,
  }
}

describe('filterHistory', () => {
  const patients = [
    makePatient({ stay_id: 1, name: 'Wilson, Emily', chiefcomplaint: 'Abdominal pain', acuity: 3, bed_history: '101' }),
    makePatient({ stay_id: 2, name: 'Chen, Marcus', chiefcomplaint: 'Chest pain', acuity: 2, bed_history: '102,201' }),
    makePatient({ stay_id: 3, name: 'Patel, Ravi', chiefcomplaint: null, acuity: 5, bed_history: null, arrival_time: '2026-07-01T09:00' }),
  ]

  it('returns everything when filters are empty', () => {
    expect(filterHistory(patients, emptyHistoryFilters)).toHaveLength(3)
  })

  it('matches search against name, stay id, and chief complaint case-insensitively', () => {
    expect(filterHistory(patients, { ...emptyHistoryFilters, search: 'chest' })).toEqual([patients[1]])
    expect(filterHistory(patients, { ...emptyHistoryFilters, search: 'CHEN' })).toEqual([patients[1]])
    expect(filterHistory(patients, { ...emptyHistoryFilters, search: '2' })).toEqual([patients[1]])
  })

  it('filters by exact acuity', () => {
    expect(filterHistory(patients, { ...emptyHistoryFilters, acuity: '5' })).toEqual([patients[2]])
  })

  it('filters by a bed present anywhere in the comma-separated bed_history', () => {
    expect(filterHistory(patients, { ...emptyHistoryFilters, bed: '201' })).toEqual([patients[1]])
  })

  it('excludes a patient with no bed_history when a bed filter is set, without throwing', () => {
    expect(filterHistory(patients, { ...emptyHistoryFilters, bed: '101' })).toEqual([patients[0]])
  })

  it('filters by arrival date range', () => {
    expect(filterHistory(patients, { ...emptyHistoryFilters, dateFrom: '2026-06-15' })).toEqual([patients[2]])
    expect(filterHistory(patients, { ...emptyHistoryFilters, dateTo: '2026-06-15' })).toEqual([patients[0], patients[1]])
  })
})

describe('collectBedOptions', () => {
  it('returns distinct, sorted bed numbers across all patients, ignoring nulls', () => {
    const patients = [
      makePatient({ bed_history: '201,101' }),
      makePatient({ bed_history: '101,301' }),
      makePatient({ bed_history: null }),
    ]
    expect(collectBedOptions(patients)).toEqual(['101', '201', '301'])
  })
})
