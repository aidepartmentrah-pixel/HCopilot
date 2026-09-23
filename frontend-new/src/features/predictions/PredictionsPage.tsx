import { RefreshCw, Table2, LineChart as LineChartIcon } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IconButton } from '@/components/ui/IconButton'
import { LoadingState } from '@/components/feedback/LoadingState'
import { useFlowForecast, useFlowHistorical, useFlowStats } from '@/hooks/useFlowPrediction'
import { useLiveModel } from '@/hooks/useModelTraining'
import type { ForecastHorizon } from '@/types/predictions'
import { classifyForecastError } from './errorClassification'
import { mergeHistoricalAndForecast } from './forecastChartData'
import { ForecastFailedState, InsufficientDataState } from './components/ForecastErrorState'
import { ForecastHorizonSelector } from './components/ForecastHorizonSelector'
import { ForecastKpiRow } from './components/ForecastKpiRow'
import { ForecastTableView } from './components/ForecastTableView'
import { HistoricalForecastChart } from './components/HistoricalForecastChart'
import { NoProductionModelState } from './components/NoProductionModelState'
import { PredictionMetadataPanel } from './components/PredictionMetadataPanel'
import styles from './PredictionsPage.module.css'

type ChartView = 'chart' | 'table'

/**
 * The first real Predictions product, Patient Flow (§4–§6) — the module
 * concept itself is built to hold future products later (§26/§46) without
 * this page needing a rewrite, but no placeholder tabs exist for them yet
 * (§27) since only Patient Flow has a real backend model today.
 */
export function PredictionsPage() {
  const [horizon, setHorizon] = useState<ForecastHorizon>(30)
  const [view, setView] = useState<ChartView>('chart')

  const stats = useFlowStats()
  const historical = useFlowHistorical(90)
  const forecast = useFlowForecast(horizon)
  const liveModel = useLiveModel()

  const isLoading = historical.isLoading || forecast.isLoading
  const isFetching = historical.isFetching || forecast.isFetching || stats.isFetching
  const forecastError = forecast.error ?? historical.error
  const errorKind = forecastError ? classifyForecastError(forecastError) : null

  function refreshAll() {
    stats.refetch()
    historical.refetch()
    forecast.refetch()
    liveModel.refetch()
  }

  const { rows, boundaryDate } = mergeHistoricalAndForecast(historical.data?.historical ?? [], forecast.data?.predictions ?? [])

  return (
    <>
      <PageHeader
        title="Predictions"
        subtitle="Forecast future ER demand using HCopilot production models."
        actions={
          <Button variant="secondary" onClick={refreshAll} disabled={isFetching}>
            <RefreshCw size={16} className={isFetching ? styles.spinning : undefined} /> Refresh
          </Button>
        }
      />

      <h2 className={styles.productTitle}>Patient Flow Forecast</h2>
      <p className={styles.productSubtitle}>
        Forecast expected ER patient volume using the currently active HCopilot prediction model.
      </p>

      {isLoading && <LoadingState label="Loading forecast…" />}

      {!isLoading && errorKind === 'no-model' && <NoProductionModelState />}
      {!isLoading && errorKind === 'insufficient-data' && <InsufficientDataState />}
      {!isLoading && errorKind === 'unknown' && <ForecastFailedState onRetry={refreshAll} />}

      {!isLoading && !errorKind && (
        <>
          <div className={styles.horizonRow}>
            <span className={styles.horizonLabel}>Forecast Horizon</span>
            <ForecastHorizonSelector value={horizon} onChange={setHorizon} />
          </div>

          {stats.data && <ForecastKpiRow stats={stats.data} />}

          <Card>
            <div className={styles.chartHeader}>
              <h3 className={styles.chartTitle}>Patient Flow — Historical vs Forecast</h3>
              <IconButton
                icon={view === 'chart' ? <Table2 size={16} /> : <LineChartIcon size={16} />}
                label={view === 'chart' ? 'Show table view' : 'Show chart view'}
                onClick={() => setView((v) => (v === 'chart' ? 'table' : 'chart'))}
              />
            </div>
            {view === 'chart' ? (
              <HistoricalForecastChart rows={rows} boundaryDate={boundaryDate} />
            ) : (
              <ForecastTableView historical={historical.data?.historical ?? []} forecast={forecast.data?.predictions ?? []} />
            )}
          </Card>

          <PredictionMetadataPanel
            liveModel={liveModel.data ?? null}
            stats={stats.data}
            forecastGeneratedAt={forecast.dataUpdatedAt || null}
          />
        </>
      )}
    </>
  )
}
