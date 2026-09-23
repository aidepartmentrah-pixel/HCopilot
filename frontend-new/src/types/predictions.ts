/** Backend only supports these three (flow_prediction/api.py's `predict?days=N` — confirmed via smoke test, not assumed); do not invent 7/14/365-day options (§7). */
export const FORECAST_HORIZONS = [30, 60, 90] as const
export type ForecastHorizon = (typeof FORECAST_HORIZONS)[number]

/** GET /api/flow-prediction/historical — real shape. */
export interface HistoricalPoint {
  date: string
  actual_patients: number
  temperature: number | null
  day_of_week: number
}

export interface HistoricalResponse {
  historical: HistoricalPoint[]
  total_days: number
}

/** GET /api/flow-prediction/predict?days=N — real shape. */
export interface ForecastPoint {
  date: string
  predicted_patients: number
  temperature: number
  day_of_week: number
}

export interface PredictResponse {
  predictions: ForecastPoint[]
  total_days: number
  model_features: string[]
}

/** GET /api/flow-prediction/stats — real shape; NOT horizon-dependent (no `days` param exists) — the old frontend's own KPI cards read directly from this, unrelated to forecast horizon (see V2.7 log). */
export interface FlowStats {
  total_records: number
  date_range: { start: string; end: string }
  avg_daily_patients: number
  max_daily_patients: number
  min_daily_patients: number
  std_daily_patients: number
}
