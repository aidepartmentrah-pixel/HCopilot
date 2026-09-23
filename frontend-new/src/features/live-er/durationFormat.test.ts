import { describe, expect, it } from 'vitest'
import { formatWaitingDuration, minutesSinceArrival } from './durationFormat'

describe('minutesSinceArrival', () => {
  const now = new Date('2026-09-22T12:00:00Z')

  it('computes real elapsed minutes since arrival', () => {
    expect(minutesSinceArrival('2026-09-22T11:52:00Z', now)).toBeCloseTo(8, 5)
  })

  it('returns null for an unparseable timestamp rather than NaN/throwing', () => {
    expect(minutesSinceArrival('not-a-date', now)).toBeNull()
  })

  it('returns null for a future arrival time (clock skew / bad data), not a negative number', () => {
    expect(minutesSinceArrival('2026-09-22T12:05:00Z', now)).toBeNull()
  })
})

describe('formatWaitingDuration', () => {
  it('formats under an hour as "NN min"', () => {
    expect(formatWaitingDuration(3)).toBe('03 min')
    expect(formatWaitingDuration(8)).toBe('08 min')
    expect(formatWaitingDuration(27)).toBe('27 min')
  })

  it('formats an hour or more as "H h MM min"', () => {
    expect(formatWaitingDuration(72)).toBe('1 h 12 min')
    expect(formatWaitingDuration(125)).toBe('2 h 5 min')
  })

  it('never renders the known-bad malformed old-frontend value (§16 — "Waiting 20814m")', () => {
    // 20814 minutes is what a stale/test timestamp produced in the old
    // frontend's bug — this must always come out as real hours/minutes.
    expect(formatWaitingDuration(20814)).toBe('346 h 54 min')
    expect(formatWaitingDuration(20814)).not.toMatch(/^\d{4,}m?$/)
  })

  it('renders an em dash for null/invalid input instead of a broken number', () => {
    expect(formatWaitingDuration(null)).toBe('—')
    expect(formatWaitingDuration(Number.NaN)).toBe('—')
    expect(formatWaitingDuration(-5)).toBe('—')
  })
})
