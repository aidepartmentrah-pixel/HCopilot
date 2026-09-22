/**
 * Shared shape for a single/multi-select ISBAR field distribution
 * (stats_manager.py's `_value_counts_chart`). `total` is the count of
 * *stays with this field actually recorded*, not every ED patient or every
 * ISBAR row — an undocumented field reports an honest zero, never a
 * negative signal. See the Statistics page's own "Aggregates from ISBAR
 * nursing documentation" framing (already shipped in the old frontend).
 */
export interface ValueCountsChart {
  labels: string[]
  counts: number[]
  total: number
}

export interface SafetyRiskSummary {
  documented_total: number
  risks: {
    fall_risk: { count: number; pct: number }
    pressure_injury_risk: { count: number; pct: number }
    allergies: { count: number; pct: number }
    isolation_precautions: { count: number; pct: number }
  }
}

/** GET /api/statistics/overview — headline KPIs, real shape per stats_manager.py's `overview()`. */
export interface StatisticsOverview {
  active_patients: number
  historical_patients: number
  avg_wait_to_bed_min: number | null
  avg_los_hours: number | null
  occupancy_rate: number | null
  avg_acuity: number | null
  long_wait_pct: number | null
  wait_sample_count: number
  los_sample_count: number
}

export interface WaitingTimesStats {
  wait_to_bed: {
    distribution: Record<string, number>
    avg_minutes: number | null
    median_minutes: number | null
    sample_count: number
  }
  length_of_stay: {
    distribution: Record<string, number>
    avg_hours: number | null
    sample_count: number
  }
}

export interface AcuityBreakdownStats {
  acuity_breakdown: {
    level: number
    label: string
    count: number
    avg_wait_min: number | null
    avg_los_hours: number | null
  }[]
}

export interface ThroughputStats {
  by_hour: Record<string, number>
  by_day_of_week: Record<string, number>
  total_arrivals: number
}

export interface TopComplaintsStats {
  complaints: { complaint: string; count: number; avg_los_hours: number | null }[]
}

export interface VitalsSummaryStats {
  vitals: Record<string, { avg: number; min: number; max: number; unit: string; normal: boolean; count: number }>
  count: number
}

// staff-stats exists and is real (see statistics/api.py's docstring) but
// isn't precisely typed yet — Statistics' NF6 build doesn't surface it (the
// page's own staff-member drill-down is a Settings/staff-admin concern, not
// ER-flow analytics), so left loose rather than guessed. Real typing
// deferred to whichever later phase actually consumes it.
export type StaffStats = Record<string, unknown>
