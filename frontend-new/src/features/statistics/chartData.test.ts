import { describe, expect, it } from 'vitest'
import {
  acuityChartData,
  arrivalsByDayChartData,
  arrivalsByHourChartData,
  lengthOfStayChartData,
  losSummary,
  safetyRisksChartData,
  topComplaintsChartData,
  valueCountsChartData,
  waitTimeChartData,
  waitTimeSummary,
} from './chartData'

describe('waitTimeChartData', () => {
  it('orders buckets chronologically, not by count', () => {
    const data = waitTimeChartData({ '>8 h': 9, '0-30 min': 40, '1-2 h': 12 })
    expect(data.map((d) => d.label)).toEqual(['0-30 min', '30-60 min', '1-2 h', '2-4 h', '4-8 h', '>8 h'])
  })

  it('zero-fills buckets the backend distribution omits', () => {
    const data = waitTimeChartData({ '0-30 min': 5 })
    expect(data.find((d) => d.label === '2-4 h')?.value).toBe(0)
  })
})

describe('lengthOfStayChartData', () => {
  it('orders LOS buckets ascending by duration', () => {
    const data = lengthOfStayChartData({ '>24 h': 3, '<4 h': 20 })
    expect(data.map((d) => d.label)).toEqual(['<4 h', '4-8 h', '8-12 h', '12-24 h', '>24 h'])
  })
})

describe('arrivalsByDayChartData', () => {
  it('orders Mon..Sun regardless of input key order', () => {
    const data = arrivalsByDayChartData({ Sun: 1, Mon: 2, Wed: 3 })
    expect(data.map((d) => d.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    expect(data.find((d) => d.label === 'Tue')?.value).toBe(0)
  })
})

describe('arrivalsByHourChartData', () => {
  it('produces all 24 hours zero-padded and zero-filled', () => {
    const data = arrivalsByHourChartData({ '0': 4, '13': 9 })
    expect(data).toHaveLength(24)
    expect(data[0]).toEqual({ label: '00:00', value: 4 })
    expect(data[13]).toEqual({ label: '13:00', value: 9 })
    expect(data[23]).toEqual({ label: '23:00', value: 0 })
  })

  it('handles the real backend pathological case of missing string-number keys', () => {
    const data = arrivalsByHourChartData({})
    expect(data.every((d) => d.value === 0)).toBe(true)
  })
})

describe('valueCountsChartData', () => {
  it('zips labels and counts and humanizes snake_case tokens by default', () => {
    const data = valueCountsChartData({ labels: ['chest_pain', 'fever'], counts: [12, 5], total: 17 })
    expect(data).toEqual([
      { label: 'Chest Pain', value: 12 },
      { label: 'Fever', value: 5 },
    ])
  })

  it('leaves labels as-is when humanizeLabels is false', () => {
    const data = valueCountsChartData({ labels: ['chest_pain'], counts: [12], total: 12 }, false)
    expect(data).toEqual([{ label: 'chest_pain', value: 12 }])
  })

  it('returns an empty array for an empty chart rather than throwing', () => {
    expect(valueCountsChartData({ labels: [], counts: [], total: 0 })).toEqual([])
  })
})

describe('acuityChartData', () => {
  it('carries real avg-wait/avg-los as tooltip extra lines', () => {
    const data = acuityChartData([{ level: 2, label: 'ESI 2', count: 146, avg_wait_min: 5.4, avg_los_hours: 17 }])
    expect(data[0].extra).toEqual(['Avg Wait: 5m', 'Avg LOS: 17h'])
    expect(data[0].label).toBe('ESI 2')
    expect(data[0].color).toBeTruthy()
  })

  it('omits an extra line entirely rather than fabricating a 0 when the backend reports null', () => {
    const data = acuityChartData([{ level: 1, label: 'ESI 1', count: 0, avg_wait_min: null, avg_los_hours: null }])
    expect(data[0].extra).toEqual([])
  })
})

describe('waitTimeSummary', () => {
  it('formats avg to one decimal and median rounded, matching the spec\'s own example precision', () => {
    expect(waitTimeSummary({ distribution: {}, avg_minutes: 27.234, median_minutes: 0, sample_count: 175 })).toBe(
      'Avg 27.2 min · Median 0 min · n=175',
    )
  })

  it('shows an em-dash instead of fabricating a value when a sample is null', () => {
    expect(waitTimeSummary({ distribution: {}, avg_minutes: null, median_minutes: null, sample_count: 0 })).toBe(
      'Avg — · Median — · n=0',
    )
  })
})

describe('losSummary', () => {
  it('never claims a median — the real backend shape has none', () => {
    const summary = losSummary({ distribution: {}, avg_hours: 14.6, sample_count: 88 })
    expect(summary).toBe('Avg 14.6h · n=88')
    expect(summary).not.toMatch(/median/i)
  })
})

describe('topComplaintsChartData', () => {
  it('caps to the top N in the backend-provided order, without re-sorting', () => {
    const complaints = Array.from({ length: 12 }, (_, i) => ({ complaint: `C${i}`, count: 12 - i, avg_los_hours: null }))
    const data = topComplaintsChartData(complaints)
    expect(data).toHaveLength(8)
    expect(data.map((d) => d.label)).toEqual(['C0', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'])
  })

  it('adds an Avg LOS extra line only when the backend provides one', () => {
    const data = topComplaintsChartData([
      { complaint: 'Chest Pain', count: 18, avg_los_hours: 6.4 },
      { complaint: 'Other', count: 12, avg_los_hours: null },
    ])
    expect(data[0].extra).toEqual(['Avg LOS: 6.4h'])
    expect(data[1].extra).toEqual([])
  })
})

describe('safetyRisksChartData', () => {
  it('maps the four fixed categories using the backend real percentage, not a recomputed one', () => {
    const data = safetyRisksChartData({
      documented_total: 127,
      risks: {
        fall_risk: { count: 4, pct: 3.1 },
        pressure_injury_risk: { count: 0, pct: 0 },
        allergies: { count: 85, pct: 66.9 },
        isolation_precautions: { count: 2, pct: 1.6 },
      },
    })
    expect(data).toEqual([
      { label: 'Fall Risk', value: 4, extra: ['3.1% of documented stays'] },
      { label: 'Pressure Injury Risk', value: 0, extra: ['0% of documented stays'] },
      { label: 'Allergies', value: 85, extra: ['66.9% of documented stays'] },
      { label: 'Isolation Precautions', value: 2, extra: ['1.6% of documented stays'] },
    ])
  })
})
