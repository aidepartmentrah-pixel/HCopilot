import { describe, expect, it } from 'vitest'
import type { ErRosterItem } from '@/types/er'
import type { Patient } from '@/types/patient'
import { classifyOccupancy, findPatientsAwaitingIsbar, isRosterStale } from './alertRules'

const NOW = new Date('2026-09-22T12:00:00.000Z')

function rosterItem(overrides: Partial<ErRosterItem>): ErRosterItem {
  return { er_visit_id: '1', arrival_time: NOW.toISOString(), ...overrides }
}

function patient(overrides: Partial<Patient>): Patient {
  return { patient_id: 1, stay_id: 1, name: 'Test', arrival_time: NOW.toISOString(), ...overrides }
}

describe('findPatientsAwaitingIsbar', () => {
  it('flags a roster patient with no matching active stay, arrived over the threshold', () => {
    const roster = [rosterItem({ er_visit_id: '100', arrival_time: '2026-09-22T11:50:00.000Z' })] // 10 min ago
    const result = findPatientsAwaitingIsbar(roster, [], NOW)
    expect(result).toHaveLength(1)
    expect(result[0].er_visit_id).toBe('100')
  })

  it('does not flag a roster patient already started as an active HCopilot stay', () => {
    const roster = [rosterItem({ er_visit_id: '100', arrival_time: '2026-09-22T11:50:00.000Z' })]
    const active = [patient({ er_visit_id: '100' })]
    expect(findPatientsAwaitingIsbar(roster, active, NOW)).toHaveLength(0)
  })

  it('does not flag a patient who arrived less than 5 minutes ago', () => {
    const roster = [rosterItem({ er_visit_id: '100', arrival_time: '2026-09-22T11:57:00.000Z' })] // 3 min ago
    expect(findPatientsAwaitingIsbar(roster, [], NOW)).toHaveLength(0)
  })

  it('flags exactly at the boundary as not-yet-over (5 minutes is not "more than 5")', () => {
    const roster = [rosterItem({ er_visit_id: '100', arrival_time: '2026-09-22T11:55:00.000Z' })] // exactly 5 min ago
    expect(findPatientsAwaitingIsbar(roster, [], NOW)).toHaveLength(0)
  })

  it('ignores roster rows with a missing or unparseable arrival time', () => {
    const roster = [rosterItem({ er_visit_id: '100', arrival_time: undefined }), rosterItem({ er_visit_id: '101', arrival_time: 'not-a-date' })]
    expect(findPatientsAwaitingIsbar(roster, [], NOW)).toHaveLength(0)
  })
})

describe('classifyOccupancy', () => {
  it('is null (normal) below the warning threshold', () => {
    expect(classifyOccupancy(79)).toBeNull()
  })
  it('is warning at and above 80%', () => {
    expect(classifyOccupancy(80)).toBe('warning')
    expect(classifyOccupancy(89)).toBe('warning')
  })
  it('is critical at and above 90%', () => {
    expect(classifyOccupancy(90)).toBe('critical')
    expect(classifyOccupancy(100)).toBe('critical')
  })
})

describe('isRosterStale', () => {
  it('is false when the roster was updated recently', () => {
    const fiveMinAgo = NOW.getTime() - 5 * 60_000
    expect(isRosterStale(fiveMinAgo, NOW)).toBe(false)
  })
  it('is true when the roster has not updated in over 8 minutes', () => {
    const nineMinAgo = NOW.getTime() - 9 * 60_000
    expect(isRosterStale(nineMinAgo, NOW)).toBe(true)
  })
  it('is false when there is no successful fetch yet (undefined)', () => {
    expect(isRosterStale(undefined, NOW)).toBe(false)
  })
})
