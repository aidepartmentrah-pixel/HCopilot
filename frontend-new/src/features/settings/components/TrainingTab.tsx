import type { ColumnDef } from '@tanstack/react-table'
import { Download, Rocket, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IconButton } from '@/components/ui/IconButton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DataTable } from '@/components/tables/DataTable'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { useToast } from '@/components/feedback/useToast'
import {
  useDeleteRun,
  useLiveModel,
  usePromoteRun,
  useTrainingRuns,
  useTrainingStatus,
  useTrainModel,
} from '@/hooks/useModelTraining'
import { modelTrainingApi } from '@/api/settings'
import { formatClinicalDate } from '@/utils/dateFormat'
import type { TrainingRun } from '@/types/settings'
import { formatMetric, runStatusLabel, runStatusTone, shortenRunId } from '../trainingFormat'
import styles from './TrainingTab.module.css'

/** Preserves the old Training page's useful structure (§20) almost unchanged: live-model summary, Train Now, run history — the real difference from the legacy page is Promote/Delete safety (§26–§27) and faithful metric display (§23). */
export function TrainingTab() {
  const live = useLiveModel()
  const status = useTrainingStatus()
  const runs = useTrainingRuns()
  const trainModel = useTrainModel()
  const promoteRun = usePromoteRun()
  const deleteRun = useDeleteRun()
  const { showToast } = useToast()

  const [confirmingTrain, setConfirmingTrain] = useState(false)
  const [promoting, setPromoting] = useState<TrainingRun | null>(null)
  const [deleting, setDeleting] = useState<TrainingRun | null>(null)

  const inProgress = status.data?.training_in_progress ?? false

  async function handleTrain() {
    setConfirmingTrain(false)
    try {
      await trainModel.mutateAsync()
      showToast('Training run started and deployed.', 'success')
    } catch {
      showToast('Training failed — see the run history for details.', 'error')
    }
  }

  async function handlePromote() {
    if (!promoting) return
    try {
      await promoteRun.mutateAsync(promoting.run_id)
      showToast('Model promoted to production.', 'success')
    } catch {
      showToast('Could not promote this run.', 'error')
    } finally {
      setPromoting(null)
    }
  }

  async function handleDelete() {
    if (!deleting) return
    try {
      await deleteRun.mutateAsync(deleting.run_id)
      showToast('Training run deleted.', 'success')
    } catch {
      showToast('Could not delete this run.', 'error')
    } finally {
      setDeleting(null)
    }
  }

  const columns: ColumnDef<TrainingRun, unknown>[] = [
    {
      accessorKey: 'run_id',
      header: 'Run',
      cell: ({ row }) => (
        <span className={styles.runCell}>
          {shortenRunId(row.original.run_id)}
          {row.original.is_live && <StatusBadge label="Live" tone="success" />}
        </span>
      ),
    },
    {
      accessorKey: 'started_at',
      header: 'Started',
      cell: ({ getValue }) => formatClinicalDate(getValue<string | null>()),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => {
        const s = getValue<TrainingRun['status']>()
        return <StatusBadge label={runStatusLabel(s)} tone={runStatusTone(s)} />
      },
    },
    { id: 'mae', header: 'MAE', cell: ({ row }) => formatMetric(row.original.metrics.mae) },
    { id: 'rmse', header: 'RMSE', cell: ({ row }) => formatMetric(row.original.metrics.rmse) },
    { id: 'r2', header: 'R²', cell: ({ row }) => formatMetric(row.original.metrics.r2) },
    { id: 'mape', header: 'MAPE', cell: ({ row }) => formatMetric(row.original.metrics.mape, 1) },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const run = row.original
        const canPromote = run.status === 'completed' && !run.is_live
        return (
          <div className={styles.actionsCell}>
            {run.artifact_path && (
              <a href={modelTrainingApi.exportUrl(run.run_id)} download>
                <IconButton icon={<Download size={16} />} label={`Export ${shortenRunId(run.run_id)}`} />
              </a>
            )}
            <IconButton
              icon={<Rocket size={16} />}
              label={`Promote ${shortenRunId(run.run_id)}`}
              disabled={!canPromote}
              onClick={(e) => {
                e.stopPropagation()
                setPromoting(run)
              }}
            />
            <IconButton
              icon={<Trash2 size={16} />}
              label={`Delete ${shortenRunId(run.run_id)}`}
              disabled={run.is_live}
              onClick={(e) => {
                e.stopPropagation()
                setDeleting(run)
              }}
            />
          </div>
        )
      },
    },
  ]

  return (
    <div className={styles.page}>
      <Card>
        <div className={styles.liveHeader}>
          <div>
            <h3 className={styles.title}>Currently Live Model</h3>
            {live.data ? (
              <p className={styles.subtitle}>
                Flow Prediction Model · Run {shortenRunId(live.data.run_id)} · Trained {formatClinicalDate(live.data.started_at)}
              </p>
            ) : (
              <p className={styles.subtitle}>No production model recorded yet.</p>
            )}
          </div>
          <Button loading={trainModel.isPending} disabled={inProgress} onClick={() => setConfirmingTrain(true)}>
            {inProgress ? 'Training…' : 'Train Now'}
          </Button>
        </div>
        {live.data && (
          <dl className={styles.metaGrid}>
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
        )}
      </Card>

      <div>
        <h3 className={styles.title}>Training Run History</h3>
        <DataTable
          data={runs.data?.runs ?? []}
          columns={columns}
          getRowId={(r) => r.run_id}
          isLoading={runs.isLoading}
          error={runs.isError ? 'Could not load training run history.' : null}
          onRetry={() => runs.refetch()}
          emptyTitle="No training runs yet"
        />
      </div>

      <ConfirmDialog
        open={confirmingTrain}
        title="Train a new model now?"
        description="This retrains the Flow Prediction model from the latest historical data and deploys it as the live model immediately. This may take a moment and cannot be interrupted."
        confirmLabel="Train Now"
        onConfirm={handleTrain}
        onCancel={() => setConfirmingTrain(false)}
      />

      <ConfirmDialog
        open={promoting !== null}
        title="Promote model to production?"
        description={
          promoting
            ? `Run: ${formatClinicalDate(promoting.started_at)} · MAE: ${formatMetric(promoting.metrics.mae)} · RMSE: ${formatMetric(promoting.metrics.rmse)} · R²: ${formatMetric(promoting.metrics.r2)} · MAPE: ${formatMetric(promoting.metrics.mape, 1)}. This model will become the live Flow Prediction model.`
            : ''
        }
        confirmLabel="Promote Model"
        onConfirm={handlePromote}
        onCancel={() => setPromoting(null)}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this training run?"
        description={
          deleting
            ? `Run: ${formatClinicalDate(deleting.started_at)} (${shortenRunId(deleting.run_id)}) · Status: ${runStatusLabel(deleting.status)}. This cannot be undone.`
            : ''
        }
        destructive
        confirmLabel="Delete Run"
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
