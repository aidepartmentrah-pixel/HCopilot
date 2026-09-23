import { apiClient } from './client'
import type { FlowStats, HistoricalResponse, PredictResponse } from '@/types/predictions'

// Real, smoke-tested endpoints (backend/features/flow_prediction/api.py).
// `predict` reads the same fixed model-file path model_training's
// train/promote actions write to (confirmed in V2.6's log) — an
// administrator promoting a run in Settings → AI & Models takes effect
// here automatically via that shared file + its own mtime cache-bust, no
// extra sync code needed (spec §33).
export const flowPredictionApi = {
  predict: (days: number) => apiClient.get<PredictResponse>(`/api/flow-prediction/predict?days=${days}`),
  historical: (days = 90) => apiClient.get<HistoricalResponse>(`/api/flow-prediction/historical?days=${days}`),
  stats: () => apiClient.get<FlowStats>('/api/flow-prediction/stats'),
}
