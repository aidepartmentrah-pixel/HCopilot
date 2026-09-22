import { describe, expect, it } from 'vitest'
import { hasAnyValue } from './sectionDirty'

describe('hasAnyValue', () => {
  it('is false when every field is empty/undefined', () => {
    expect(hasAnyValue({ name: '', age: undefined }, ['name', 'age'])).toBe(false)
  })

  it('is true when a top-level field has a value', () => {
    expect(hasAnyValue({ name: 'Jane' }, ['name', 'age'])).toBe(true)
  })

  it('resolves nested isbar.* paths', () => {
    expect(hasAnyValue({ isbar: { clinical_status: 'Stable' } }, ['isbar.clinical_status'])).toBe(true)
    expect(hasAnyValue({ isbar: { clinical_status: '' } }, ['isbar.clinical_status'])).toBe(false)
  })

  it('treats whitespace-only strings as empty', () => {
    expect(hasAnyValue({ name: '   ' }, ['name'])).toBe(false)
  })

  it('treats false booleans as empty but true as a real value', () => {
    expect(hasAnyValue({ isbar: { receiver_ack: false } }, ['isbar.receiver_ack'])).toBe(false)
    expect(hasAnyValue({ isbar: { receiver_ack: true } }, ['isbar.receiver_ack'])).toBe(true)
  })
})
