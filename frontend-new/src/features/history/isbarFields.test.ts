import { describe, expect, it } from 'vitest'
import { sectionRecordedStatus, vitalsFields } from './isbarFields'
import type { FieldSpec } from './isbarFields'

describe('sectionRecordedStatus', () => {
  it('is not-recorded when no field has a value', () => {
    const fields: FieldSpec[] = [{ label: 'A', value: null }, { label: 'B', value: undefined }]
    expect(sectionRecordedStatus(fields)).toBe('not-recorded')
  })

  it('is recorded when every field has a value', () => {
    const fields: FieldSpec[] = [{ label: 'A', value: 'x' }, { label: 'B', value: 'y' }]
    expect(sectionRecordedStatus(fields)).toBe('recorded')
  })

  it('is partially-recorded when some but not all fields have a value', () => {
    const fields: FieldSpec[] = [{ label: 'A', value: 'x' }, { label: 'B', value: null }]
    expect(sectionRecordedStatus(fields)).toBe('partially-recorded')
  })

  it('reflects a real vitalsFields derivation from a null isbar record', () => {
    expect(sectionRecordedStatus(vitalsFields(null))).toBe('not-recorded')
  })

  it('reflects a real vitalsFields derivation from a fully-populated record', () => {
    const fields = vitalsFields({
      blood_glucose: 110,
      o2_support: 'room_air',
      o2_flow_rate: 2,
      vitals_recorded_by: 'RN Smith',
      vitals_measured_at: '2026-06-12T16:35',
    })
    expect(sectionRecordedStatus(fields)).toBe('recorded')
  })
})
