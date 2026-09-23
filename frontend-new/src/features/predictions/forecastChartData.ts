import type { ForecastPoint, HistoricalPoint } from '@/types/predictions'

/** Short "18 Sep" axis/tooltip date label (§19) — same fixed 'en-GB' locale discipline as `formatClinicalDate` (History/Statistics), so a hospital workstation's OS locale never reorders day/month here either. Input is a plain "YYYY-MM-DD" backend date (no time component), parsed as UTC so the date never shifts a day depending on the viewer's own timezone offset (§20). */
export function formatForecastDate(dateStr: string, includeYear = false): string {
  const date = new Date(`${dateStr}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return dateStr
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: includeYear ? 'numeric' : undefined, timeZone: 'UTC' })
}

export interface ForecastChartRow {
  date: string
  historical: number | null
  forecast: number | null
}

export interface MergedForecastSeries {
  rows: ForecastChartRow[]
  /** The last historical date — where the "Forecast begins" boundary marker (§15) sits. `null` when there's no historical data at all. */
  boundaryDate: string | null
}

/**
 * Merges historical + forecast into one recharts-friendly row array, with
 * the bridge technique the old frontend already used (flow_prediction.js):
 * the last historical date also carries the forecast series' own value at
 * that same point, so the dashed forecast line visually continues from
 * the solid historical line instead of floating as two disconnected
 * segments (§38 — "historical and forecast data should connect
 * correctly"). This never duplicates a historical value as a *forecast*
 * date — it only lets the boundary row carry both series.
 */
export function mergeHistoricalAndForecast(historical: HistoricalPoint[], forecast: ForecastPoint[]): MergedForecastSeries {
  const historicalRows: ForecastChartRow[] = historical.map((h) => ({ date: h.date, historical: h.actual_patients, forecast: null }))
  const forecastRows: ForecastChartRow[] = forecast.map((f) => ({ date: f.date, historical: null, forecast: f.predicted_patients }))

  if (historicalRows.length === 0) {
    return { rows: forecastRows, boundaryDate: null }
  }

  const lastHistorical = historicalRows[historicalRows.length - 1]
  const bridgedLast: ForecastChartRow = { ...lastHistorical, forecast: lastHistorical.historical }

  return {
    rows: [...historicalRows.slice(0, -1), bridgedLast, ...forecastRows],
    boundaryDate: lastHistorical.date,
  }
}
