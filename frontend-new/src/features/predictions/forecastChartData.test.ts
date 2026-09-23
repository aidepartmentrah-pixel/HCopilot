import { describe, expect, it } from 'vitest'
import type { ForecastPoint, HistoricalPoint } from '@/types/predictions'
import { formatForecastDate, mergeHistoricalAndForecast } from './forecastChartData'

const historical: HistoricalPoint[] = [
  { date: '2026-09-20', actual_patients: 0, temperature: 20, day_of_week: 6 },
  { date: '2026-09-21', actual_patients: 0, temperature: 20, day_of_week: 0 },
  { date: '2026-09-22', actual_patients: 77, temperature: 20, day_of_week: 1 },
]

const forecast: ForecastPoint[] = [
  { date: '2026-09-23', predicted_patients: 84.08, temperature: 20, day_of_week: 2 },
  { date: '2026-09-24', predicted_patients: 82.69, temperature: 20, day_of_week: 3 },
]

describe('mergeHistoricalAndForecast', () => {
  it('keeps chronological order across both series', () => {
    const { rows } = mergeHistoricalAndForecast(historical, forecast)
    expect(rows.map((r) => r.date)).toEqual(['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24'])
  })

  it('sets the boundary date to the last historical date', () => {
    const { boundaryDate } = mergeHistoricalAndForecast(historical, forecast)
    expect(boundaryDate).toBe('2026-09-22')
  })

  it('bridges the boundary row so both series carry a real value there, connecting the lines', () => {
    const { rows } = mergeHistoricalAndForecast(historical, forecast)
    const boundaryRow = rows.find((r) => r.date === '2026-09-22')
    expect(boundaryRow).toEqual({ date: '2026-09-22', historical: 77, forecast: 77 })
  })

  it('never invents a historical value on an actual forecast date — those stay forecast-only', () => {
    const { rows } = mergeHistoricalAndForecast(historical, forecast)
    const forecastRow = rows.find((r) => r.date === '2026-09-23')
    expect(forecastRow).toEqual({ date: '2026-09-23', historical: null, forecast: 84.08 })
  })

  it('keeps every non-boundary historical row forecast-null', () => {
    const { rows } = mergeHistoricalAndForecast(historical, forecast)
    expect(rows[0]).toEqual({ date: '2026-09-20', historical: 0, forecast: null })
  })

  it('handles no historical data — no boundary, just the forecast series', () => {
    const { rows, boundaryDate } = mergeHistoricalAndForecast([], forecast)
    expect(boundaryDate).toBeNull()
    expect(rows).toEqual([
      { date: '2026-09-23', historical: null, forecast: 84.08 },
      { date: '2026-09-24', historical: null, forecast: 82.69 },
    ])
  })

  it('handles no forecast data — just the historical series, still a real boundary date', () => {
    const { rows, boundaryDate } = mergeHistoricalAndForecast(historical, [])
    expect(boundaryDate).toBe('2026-09-22')
    expect(rows).toHaveLength(3)
    expect(rows[2]).toEqual({ date: '2026-09-22', historical: 77, forecast: 77 })
  })
})

describe('formatForecastDate', () => {
  it('formats a plain date string as day-month, no year by default', () => {
    // 'en-GB' ICU renders September's short form as "Sept" in this
    // runtime (the same locale/format `formatClinicalDate` uses) —
    // asserting the real output, not an assumed "Sep".
    expect(formatForecastDate('2026-09-22')).toBe('22 Sept')
  })

  it('includes the year when asked', () => {
    expect(formatForecastDate('2026-09-22', true)).toBe('22 Sept 2026')
  })

  it('parses the date as UTC so it never shifts a day for a viewer in a different timezone', () => {
    // A date-only string with no time component must read as that same
    // calendar day regardless of the browser's local timezone offset.
    expect(formatForecastDate('2026-01-01')).toBe('01 Jan')
  })
})
