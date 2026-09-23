import { useQuery } from '@tanstack/react-query'
import { flowPredictionApi } from '@/api/predictions'
import type { ForecastHorizon } from '@/types/predictions'

export const flowPredictionKeys = {
  stats: ['flow-prediction', 'stats'] as const,
  historical: (days: number) => ['flow-prediction', 'historical', days] as const,
  forecast: (days: ForecastHorizon) => ['flow-prediction', 'forecast', days] as const,
}

/** Not horizon-dependent (no `days` param on this endpoint) — see forecastChartData.ts's own note on why the KPI row doesn't change when the horizon control does. */
export function useFlowStats() {
  return useQuery({ queryKey: flowPredictionKeys.stats, queryFn: flowPredictionApi.stats })
}

export function useFlowHistorical(days = 90) {
  return useQuery({ queryKey: flowPredictionKeys.historical(days), queryFn: () => flowPredictionApi.historical(days) })
}

export function useFlowForecast(days: ForecastHorizon) {
  return useQuery({ queryKey: flowPredictionKeys.forecast(days), queryFn: () => flowPredictionApi.predict(days) })
}
