import { StatusBadge } from '@/components/ui/StatusBadge'
import type { StatusTone } from '@/components/ui/StatusBadge'
import type { RecordedStatus } from '../isbarFields'

const META: Record<RecordedStatus, { label: string; tone: StatusTone }> = {
  recorded: { label: 'Recorded', tone: 'success' },
  'partially-recorded': { label: 'Partially recorded', tone: 'warning' },
  'not-recorded': { label: 'Not recorded', tone: 'neutral' },
}

/** History spec §26 — only states derivable from real recorded data, never invented. */
export function RecordedStatusBadge({ status }: { status: RecordedStatus }) {
  const meta = META[status]
  return <StatusBadge label={meta.label} tone={meta.tone} />
}
