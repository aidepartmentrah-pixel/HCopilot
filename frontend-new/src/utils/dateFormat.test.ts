import { describe, expect, it } from 'vitest'
import { formatClinicalDate } from './dateFormat'

describe('formatClinicalDate', () => {
  it('formats a backend timestamp as "DD Mon YYYY, HH:mm"', () => {
    expect(formatClinicalDate('2026-06-12T16:35')).toBe('12 Jun 2026, 16:35')
  })

  it('renders an em dash for null/undefined rather than a blank cell', () => {
    expect(formatClinicalDate(null)).toBe('—')
    expect(formatClinicalDate(undefined)).toBe('—')
  })

  it('returns the raw value for an unparseable string rather than throwing', () => {
    expect(formatClinicalDate('not-a-date')).toBe('not-a-date')
  })
})
