import { Copy } from 'lucide-react'
import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { IconButton } from '@/components/ui/IconButton'
import type { TrainingRun } from '@/types/settings'
import type { FlowStats } from '@/types/predictions'
import { formatClinicalDate } from '@/utils/dateFormat'
import styles from './PredictionMetadataPanel.module.css'

interface PredictionMetadataPanelProps {
  liveModel: TrainingRun | null
  stats: FlowStats | undefined
  /** The forecast query's own `dataUpdatedAt` — a real client-observed fetch timestamp, not a backend field (the endpoint is stateless/computed on demand, §24's "Last Forecast Generated"). */
  forecastGeneratedAt: number | null
}

/**
 * Compact technical/provenance panel (§24, §39) — secondary to the chart,
 * never dominating it. `liveModel` is the same real `useLiveModel()` hook
 * V2.6's Model Registry already reads (§28 — reuse, don't duplicate).
 */
export function PredictionMetadataPanel({ liveModel, stats, forecastGeneratedAt }: PredictionMetadataPanelProps) {
  const [copied, setCopied] = useState(false)

  async function copyRunId() {
    if (!liveModel) return
    try {
      await navigator.clipboard.writeText(liveModel.run_id)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard access can be denied by the browser — the run id remains visible and selectable either way.
    }
  }

  return (
    <Card className={styles.panel}>
      <h3 className={styles.title}>Production Model</h3>
      <p className={styles.modelName}>Flow Prediction Model</p>

      <dl className={styles.grid}>
        <div>
          <dt>Production Run</dt>
          <dd className={styles.runRow}>
            <span className={styles.runId}>{liveModel?.run_id ?? '—'}</span>
            {liveModel && (
              <IconButton icon={<Copy size={12} />} label={copied ? 'Copied' : 'Copy run ID'} size="sm" onClick={copyRunId} />
            )}
          </dd>
        </div>
        <div>
          <dt>Last Trained</dt>
          <dd>{liveModel ? formatClinicalDate(liveModel.started_at) : '—'}</dd>
        </div>
        <div>
          <dt>Training Data Through</dt>
          <dd>{liveModel?.train_data_end ?? '—'}</dd>
        </div>
        <div>
          <dt>Historical Records</dt>
          <dd>{stats?.total_records ?? '—'}</dd>
        </div>
        <div>
          <dt>Last Forecast Generated</dt>
          <dd>{forecastGeneratedAt ? formatClinicalDate(new Date(forecastGeneratedAt).toISOString()) : '—'}</dd>
        </div>
        <div>
          <dt>Algorithm</dt>
          <dd>XGBoost</dd>
        </div>
      </dl>
    </Card>
  )
}
