import type { MetricTone } from '@/components/ui/MetricCard'

/**
 * Centralized KPI semantic thresholds (§7 — "must be centralized and
 * configurable... do not hardcode arbitrary thresholds separately in
 * multiple components"). Tune here only; every KPI card reads from this
 * single source rather than re-deciding its own cutoffs.
 */
export const KPI_THRESHOLDS = {
  occupancyWarningPct: 85,
  occupancyCriticalPct: 95,
  longWaitWarningPct: 10,
  longWaitCriticalPct: 25,
} as const

export function occupancyTone(rate: number | null): MetricTone {
  if (rate == null) return 'neutral'
  if (rate >= KPI_THRESHOLDS.occupancyCriticalPct) return 'danger'
  if (rate >= KPI_THRESHOLDS.occupancyWarningPct) return 'warning'
  return 'success'
}

export function longWaitTone(pct: number | null): MetricTone {
  if (pct == null) return 'neutral'
  if (pct >= KPI_THRESHOLDS.longWaitCriticalPct) return 'danger'
  if (pct >= KPI_THRESHOLDS.longWaitWarningPct) return 'warning'
  return 'neutral'
}
