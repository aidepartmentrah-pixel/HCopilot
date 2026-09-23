import type { StatusTone } from '@/components/ui/StatusBadge'
import type { TrainingRun } from '@/types/settings'

/** Backend `status` is completed/failed/running — "Live" (§24) is a separate `is_live` flag layered on top, not a fourth status value, so callers render it as its own badge rather than faking a status enum. */
export function runStatusLabel(status: TrainingRun['status']): string {
  if (status === 'completed') return 'Completed'
  if (status === 'failed') return 'Failed'
  return 'Running'
}

export function runStatusTone(status: TrainingRun['status']): StatusTone {
  if (status === 'completed') return 'success'
  if (status === 'failed') return 'danger'
  return 'brand'
}

/** Faithful display only (§23) — never caps, rounds away, or hides an anomalous value; a null metric (e.g. a failed run) reads as "—", not a fabricated 0. No anomaly-flagging heuristic is invented here since the backend defines none — interpretation is left to the administrator, exactly as §23 specifies. */
export function formatMetric(value: number | null, decimals = 3): string {
  if (value == null) return '—'
  return value.toFixed(decimals)
}

/** The run_id's own leading timestamp segment ("20260918T084241Z") read as a real date, not the opaque suffix hash — §21's "friendly formatting, don't lead with an unreadable run ID" applied to the run history table's compact Run column. */
export function shortenRunId(runId: string): string {
  return runId.length > 16 ? `${runId.slice(0, 15)}…` : runId
}
