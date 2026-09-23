import { ApiError } from '@/api/client'

export type ForecastErrorKind = 'no-model' | 'insufficient-data' | 'unknown'

function extractDetail(message: string): string {
  try {
    const parsed = JSON.parse(message)
    return typeof parsed?.detail === 'string' ? parsed.detail : message
  } catch {
    return message
  }
}

/**
 * The backend has no distinct error code for "no production model" (§29)
 * vs "insufficient historical data" (§31) — both are a real 404 with
 * different `detail` text (`flow_prediction/api.py`'s `_get_model_data`/
 * `_get_ml_df`). Classified here from that real text rather than treated
 * as one generic failure, so the two spec-required empty states show the
 * right message — but any 404 whose text doesn't match either known
 * phrase, or any non-404 error, falls back to the generic "forecast
 * unavailable" failure state (§30) rather than guessing. Raw backend text
 * is never shown to the user — only used to pick which state to render.
 */
export function classifyForecastError(err: unknown): ForecastErrorKind {
  if (!(err instanceof ApiError) || err.status !== 404) return 'unknown'
  const detail = extractDetail(err.message)
  if (detail.includes('Model file not found')) return 'no-model'
  if (detail.includes('dataset is empty')) return 'insufficient-data'
  return 'unknown'
}
