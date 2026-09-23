import { humanize } from '@/utils/humanize'
import type { AcuityBreakdownStats, SafetyRiskSummary, TopComplaintsStats, ValueCountsChart, WaitingTimesStats } from '@/types/statistics'
import { acuityBarColor } from './acuityColor'

export interface ChartDatum {
  label: string
  value: number
  color?: string
  /** Extra pre-formatted tooltip lines beyond value/percentage (e.g. Acuity's "Avg Wait: 5.4 min") — §27. */
  extra?: string[]
}

const WAIT_BUCKET_ORDER = ['0-30 min', '30-60 min', '1-2 h', '2-4 h', '4-8 h', '>8 h']
const LOS_BUCKET_ORDER = ['<4 h', '4-8 h', '8-12 h', '12-24 h', '>24 h']
const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** A backend distribution (e.g. wait-time buckets) in a fixed, analytically meaningful order — never sorted by count (spec §14/§19 — chronological/ordinal, not ranked). */
function orderedDistribution(distribution: Record<string, number>, order: string[]): ChartDatum[] {
  return order.map((label) => ({ label, value: distribution[label] ?? 0 }))
}

export function waitTimeChartData(distribution: Record<string, number>): ChartDatum[] {
  return orderedDistribution(distribution, WAIT_BUCKET_ORDER)
}

export function lengthOfStayChartData(distribution: Record<string, number>): ChartDatum[] {
  return orderedDistribution(distribution, LOS_BUCKET_ORDER)
}

/** `by_day_of_week` keys are already "Mon".."Sun" strings — reordered chronologically, never by count (§19). */
export function arrivalsByDayChartData(byDayOfWeek: Record<string, number>): ChartDatum[] {
  return orderedDistribution(byDayOfWeek, DAY_ORDER)
}

/** `by_hour` keys are string numbers ("0".."23"), not guaranteed-ordered object keys — built explicitly, zero-filled for hours with no arrivals, real "00:00".."23:00" labels (§18/§36 — hospital-local hours, exactly what the backend already buckets by). */
export function arrivalsByHourChartData(byHour: Record<string, number>): ChartDatum[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    label: `${String(hour).padStart(2, '0')}:00`,
    value: byHour[String(hour)] ?? 0,
  }))
}

/** A ValueCountsChart (labels[]/counts[] pair) into the shared chart shape, humanizing snake_case tokens for display. */
export function valueCountsChartData(chart: ValueCountsChart, humanizeLabels = true): ChartDatum[] {
  return chart.labels.map((label, i) => ({ label: humanizeLabels ? humanize(label) : label, value: chart.counts[i] }))
}

/** Header summary chip (§13/§40) — one decimal for the average, per the spec's own "Avg: 27.2 min" example; a null sample renders "—", never a fabricated 0. */
export function waitTimeSummary(waitToBed: WaitingTimesStats['wait_to_bed']): string {
  const avg = waitToBed.avg_minutes != null ? `${waitToBed.avg_minutes.toFixed(1)} min` : '—'
  const median = waitToBed.median_minutes != null ? `${Math.round(waitToBed.median_minutes)} min` : '—'
  return `Avg ${avg} · Median ${median} · n=${waitToBed.sample_count}`
}

/** No median field exists for length_of_stay (real backend shape has only avg_hours) — never claim one (§34/§38). */
export function losSummary(lengthOfStay: WaitingTimesStats['length_of_stay']): string {
  const avg = lengthOfStay.avg_hours != null ? `${lengthOfStay.avg_hours}h` : '—'
  return `Avg ${avg} · n=${lengthOfStay.sample_count}`
}

/** ESI-colored chart data with real Avg Wait / Avg LOS as tooltip context (§15/§27) — omits a metric line entirely rather than showing a fabricated 0 when the backend reports null. */
export function acuityChartData(breakdown: AcuityBreakdownStats['acuity_breakdown']): ChartDatum[] {
  return breakdown.map((row) => ({
    label: `ESI ${row.level}`,
    value: row.count,
    color: acuityBarColor(row.level),
    extra: [
      row.avg_wait_min != null ? `Avg Wait: ${Math.round(row.avg_wait_min)}m` : null,
      row.avg_los_hours != null ? `Avg LOS: ${row.avg_los_hours}h` : null,
    ].filter((line): line is string => line != null),
  }))
}

/** Chief-complaint counts, capped to the top N (matches the pre-redesign page's own cap — a real chart, not a full-table dump, is unreadable past ~8 ranked bars). Trusts the backend's existing ordering rather than re-sorting client-side. */
export function topComplaintsChartData(complaints: TopComplaintsStats['complaints'], limit = 8): ChartDatum[] {
  return complaints
    .slice(0, limit)
    .map((c) => ({ label: c.complaint, value: c.count, extra: c.avg_los_hours != null ? [`Avg LOS: ${c.avg_los_hours}h`] : [] }))
}

/** The four fixed safety-risk categories (§21), trusting the backend's own real `pct` rather than recomputing it from a client-side total. */
export function safetyRisksChartData(summary: SafetyRiskSummary): ChartDatum[] {
  return (
    [
      ['Fall Risk', summary.risks.fall_risk],
      ['Pressure Injury Risk', summary.risks.pressure_injury_risk],
      ['Allergies', summary.risks.allergies],
      ['Isolation Precautions', summary.risks.isolation_precautions],
    ] as const
  ).map(([label, r]) => ({ label, value: r.count, extra: [`${r.pct}% of documented stays`] }))
}
