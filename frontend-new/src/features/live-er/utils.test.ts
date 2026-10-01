import { describe, expect, it } from 'vitest'
import { avatarKind, cardFromBed, cardFromBedless, isOverAttentionThreshold } from './utils'
import type { Bed, BedlessPatient } from '@/types/bed'

describe('avatarKind', () => {
  it('picks man/woman for adults, boy/girl under 18', () => {
    expect(avatarKind('Male', 40)).toBe('man')
    expect(avatarKind('Female', 40)).toBe('woman')
    expect(avatarKind('Male', 9)).toBe('boy')
    expect(avatarKind('Female', 17)).toBe('girl')
  })
  it('treats exactly 18 as an adult', () => {
    expect(avatarKind('Male', 18)).toBe('man')
  })
  it('matches gender case-insensitively and ignores surrounding whitespace', () => {
    expect(avatarKind(' MALE ', 30)).toBe('man')
    expect(avatarKind('female', 30)).toBe('woman')
  })
  it('falls back to a neutral avatar when gender is unknown, still honoring age', () => {
    expect(avatarKind(null, null)).toBe('neutral')
    expect(avatarKind('Other', 30)).toBe('neutral')
    expect(avatarKind(null, 5)).toBe('neutral-child')
  })
  it('treats an unknown age as an adult', () => {
    expect(avatarKind('Female', null)).toBe('woman')
  })
})

describe('isOverAttentionThreshold', () => {
  it('is false under 5 minutes', () => {
    expect(isOverAttentionThreshold(3)).toBe(false)
  })
  it('is true over 5 minutes', () => {
    expect(isOverAttentionThreshold(6)).toBe(true)
  })
  it('is false for null (unparseable/future arrival)', () => {
    expect(isOverAttentionThreshold(null)).toBe(false)
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

  it('normalizes an occupied bed with patient identity, ID, and bed type', () => {
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
    expect(card.patientId).toBe(42)
    expect(card.bedType).toBe('normal')
  })

  it('normalizes a bedless patient with real elapsed waiting time, flagged when over threshold', () => {
    const now = new Date('2026-09-22T12:00:00Z')
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
    const card = cardFromBedless(patient, now)
    expect(card.kind).toBe('waiting')
    expect(card.statusTone).toBe('waiting')
    expect(card.waitingMinutes).toBeCloseTo(10, 5)
    expect(card.avatar).toBe('woman')
    expect(card.isWaitingOverThreshold).toBe(true)
  })

  it('flags a bedless patient as over-threshold even when already triaged (§5 fix — waiting-for-bed is independent of triage status)', () => {
    const now = new Date('2026-09-22T12:00:00Z')
    const patient: BedlessPatient = {
      subject_id: 2,
      stay_id: 101,
      name: 'Triaged Patient',
      gender: 'Male',
      age: 50,
      temperature: null,
      heartrate: null,
      resprate: null,
      o2sat: null,
      sbp: null,
      dbp: null,
      pain: null,
      acuity: 3,
      chiefcomplaint: null,
      arrival_time: '2026-09-22T11:00:00Z',
      triage_time: '2026-09-22T11:05:00Z',
      er_visit_id: null,
      unurgent: false,
      doctor_ids: [],
      nurse_ids: [],
    }
    const card = cardFromBedless(patient, now)
    expect(card.isWaitingOverThreshold).toBe(true)
  })
})
