import { describe, expect, it } from 'vitest'
import { longWaitTone, occupancyTone } from './kpiThresholds'

describe('occupancyTone', () => {
  it('is neutral when unknown', () => {
    expect(occupancyTone(null)).toBe('neutral')
  })
  it('is success below the warning threshold', () => {
    expect(occupancyTone(60)).toBe('success')
  })
  it('is warning at/above 85%', () => {
    expect(occupancyTone(85)).toBe('warning')
    expect(occupancyTone(90)).toBe('warning')
  })
  it('is danger at/above 95%', () => {
    expect(occupancyTone(95)).toBe('danger')
    expect(occupancyTone(100)).toBe('danger')
  })
})

describe('longWaitTone', () => {
  it('is neutral when unknown', () => {
    expect(longWaitTone(null)).toBe('neutral')
  })
  it('is neutral below the warning threshold', () => {
    expect(longWaitTone(5)).toBe('neutral')
  })
  it('is warning at/above 10%', () => {
    expect(longWaitTone(10)).toBe('warning')
    expect(longWaitTone(20)).toBe('warning')
  })
  it('is danger at/above 25%', () => {
    expect(longWaitTone(25)).toBe('danger')
  })
})
