import { BrainCircuit } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { useLiveModel, useModelFiles } from '@/hooks/useModelTraining'
import { formatClinicalDate } from '@/utils/dateFormat'
import { formatMetric, shortenRunId } from '../trainingFormat'
import styles from './ModelRegistryTab.module.css'

/** Redesigned around the model, not the raw filesystem artifact (§18) — the live training run is the primary content; the old page's file/path view is demoted into a collapsed "Technical Details" section (§19), never the first thing shown. */
export function ModelRegistryTab() {
  const live = useLiveModel()
  const files = useModelFiles()

  if (live.isLoading) return <LoadingState label="Loading model registry…" />
  if (live.isError) return <ErrorState description="Could not load the live model." onRetry={() => live.refetch()} />

  return (
    <div className={styles.page}>
      {!live.data ? (
        <EmptyState
          icon={<BrainCircuit size={22} />}
          title="No production model recorded yet"
          description="Trigger a new training run in the Training tab — the current model file predates this registry."
        />
      ) : (
        <Card>
          <div className={styles.header}>
            <div>
              <h3 className={styles.title}>Flow Prediction Model</h3>
              <p className={styles.subtitle}>Status</p>
            </div>
            <StatusBadge label="Live" tone="success" />
          </div>

          <dl className={styles.metaGrid}>
            <div>
              <dt>Associated Training Run</dt>
              <dd>{shortenRunId(live.data.run_id)}</dd>
            </div>
            <div>
              <dt>Trained</dt>
              <dd>{formatClinicalDate(live.data.started_at)}</dd>
            </div>
            <div>
              <dt>Training Rows</dt>
              <dd>{live.data.row_count_train ?? '—'}</dd>
            </div>
            <div>
              <dt>Test Rows</dt>
              <dd>{live.data.row_count_test ?? '—'}</dd>
            </div>
            <div>
              <dt>Data Through</dt>
              <dd>{live.data.train_data_end ?? '—'}</dd>
            </div>
          </dl>

          <div className={styles.metrics}>
            <div>
              <span className={styles.metricLabel}>MAE</span>
              <span className={styles.metricValue}>{formatMetric(live.data.metrics.mae)}</span>
            </div>
            <div>
              <span className={styles.metricLabel}>RMSE</span>
              <span className={styles.metricValue}>{formatMetric(live.data.metrics.rmse)}</span>
            </div>
            <div>
              <span className={styles.metricLabel}>R²</span>
              <span className={styles.metricValue}>{formatMetric(live.data.metrics.r2)}</span>
            </div>
            <div>
              <span className={styles.metricLabel}>MAPE</span>
              <span className={styles.metricValue}>{formatMetric(live.data.metrics.mape, 1)}</span>
            </div>
          </div>
        </Card>
      )}

      <details className={styles.technicalDetails}>
        <summary>Technical Details</summary>
        {files.isLoading && <LoadingState label="Loading model files…" />}
        {files.isError && <ErrorState description="Could not load model files." onRetry={() => files.refetch()} />}
        {files.data && files.data.models.length === 0 && <p className={styles.empty}>No model files found on disk.</p>}
        {files.data && files.data.models.length > 0 && (
          <table className={styles.filesTable}>
            <thead>
              <tr>
                <th>Model File</th>
                <th>Size</th>
                <th>Modified</th>
                <th>Path</th>
              </tr>
            </thead>
            <tbody>
              {files.data.models.map((f) => (
                <tr key={f.name}>
                  <td>{f.name}</td>
                  <td>{f.size_mb} MB</td>
                  <td>{formatClinicalDate(f.modified)}</td>
                  <td className={styles.path}>{f.path}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </details>
    </div>
  )
}
