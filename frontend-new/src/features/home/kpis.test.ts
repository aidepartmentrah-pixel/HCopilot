import { describe, expect, it } from 'vitest'
import type { LogPatient } from '@/types/history'
import { countDischargedToday } from './kpis'

const NOW = new Date('2026-09-22T18:00:00')

function logPatient(overrides: Partial<LogPatient>): LogPatient {
  return {
    subject_id: 1,
    stay_id: 1,
    name: 'Test',
    gender: null,
    age: null,
    arrival_time: '2026-09-22T08:00:00',
    departure_time: null,
    bed_occupation_time: null,
    destination: null,
    bed_history: null,
    admission_ward_id: null,
    admission_ward_name: null,
    temperature: null,
    heartrate: null,
    resprate: null,
    o2sat: null,
    sbp: null,
    dbp: null,
    pain: null,
    acuity: null,
    chiefcomplaint: null,
    external_patient_id: null,
    external_visit_id: null,
    record_source: null,
    er_visit_id: null,
    triage_time: null,
    departure_source: null,
    ...overrides,
  }
}

describe('countDischargedToday', () => {
  it('counts stays discharged today', () => {
    const patients = [logPatient({ departure_time: '2026-09-22T09:00:00' }), logPatient({ departure_time: '2026-09-22T17:00:00' })]
    expect(countDischargedToday(patients, NOW)).toBe(2)
  })

  it('excludes stays discharged on a different day', () => {
    const patients = [logPatient({ departure_time: '2026-09-21T23:59:00' })]
    expect(countDischargedToday(patients, NOW)).toBe(0)
  })

  it('excludes stays with no departure time', () => {
    const patients = [logPatient({ departure_time: null })]
    expect(countDischargedToday(patients, NOW)).toBe(0)
  })
})
