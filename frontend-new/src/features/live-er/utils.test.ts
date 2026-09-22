import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cardFromBed, cardFromBedless, isWaitingOverThreshold } from './utils'
import type { Bed, BedlessPatient } from '@/types/bed'

describe('isWaitingOverThreshold', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-22T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is false when triage_time is set, regardless of how long ago arrival was', () => {
    expect(isWaitingOverThreshold('2026-09-22T11:00:00Z', '2026-09-22T11:10:00Z')).toBe(false)
  })

  it('is false when arrival was less than 5 minutes ago', () => {
    expect(isWaitingOverThreshold('2026-09-22T11:57:00Z', null)).toBe(false)
  })

  it('is true when arrival was more than 5 minutes ago and not yet triaged', () => {
    expect(isWaitingOverThreshold('2026-09-22T11:50:00Z', null)).toBe(true)
  })

  it('is false for an unparseable arrival time rather than throwing', () => {
    expect(isWaitingOverThreshold('not-a-date', null)).toBe(false)
  })
})

describe('cardFromBed / cardFromBedless', () => {
  it('normalizes an available bed with no patient info in `sub`', () => {
    const bed: Bed = {
      bed_id: 1,
      bed_number: '101',
      bed_condition: 'Available',
      bed_status: 'Available',
      bed_type: 'normal',
      ward_id: 1,
      ward_name: 'Section A',
      patient_id: null,
      patient_name: null,
      patient_gender: null,
      patient_age: null,
    }
    const card = cardFromBed(bed)
    expect(card.statusTone).toBe('success')
    expect(card.sub).toBe('')
    expect(card.isWaitingOverThreshold).toBe(false)
  })

  it('normalizes an occupied bed with patient identity in `sub`', () => {
    const bed: Bed = {
      bed_id: 2,
      bed_number: '102',
      bed_condition: 'Available',
      bed_status: 'Occupied',
      bed_type: 'normal',
      ward_id: 1,
      ward_name: 'Section A',
      patient_id: 42,
      patient_name: 'Chen, Marcus',
      patient_gender: 'Male',
      patient_age: 42,
    }
    const card = cardFromBed(bed)
    expect(card.statusTone).toBe('occupied')
    expect(card.sub).toBe('Chen, Marcus · 42y Male')
  })

  it('normalizes a bedless patient into the same card shape, flagged when waiting over threshold', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-22T12:00:00Z'))
    const patient: BedlessPatient = {
      subject_id: 1,
      stay_id: 100,
      name: 'Wilson, Emily',
      gender: 'Female',
      age: 28,
      temperature: null,
      heartrate: null,
      resprate: null,
      o2sat: null,
      sbp: null,
      dbp: null,
      pain: null,
      acuity: 2,
      chiefcomplaint: 'Chest pain',
      arrival_time: '2026-09-22T11:50:00Z',
      triage_time: null,
      er_visit_id: null,
      unurgent: false,
      doctor_ids: [],
      nurse_ids: [],
    }
    const card = cardFromBedless(patient)
    expect(card.kind).toBe('waiting')
    expect(card.statusTone).toBe('waiting')
    expect(card.isWaitingOverThreshold).toBe(true)
    vi.useRealTimers()
  })
})
