import { StatusBadge } from '@/components/ui/StatusBadge'
import type { StatusTone } from '@/components/ui/StatusBadge'
import type { SectionStatus } from '../stepProgression'

const STATUS_META: Record<SectionStatus, { label: string; tone: StatusTone }> = {
  'not-started': { label: 'Not started', tone: 'neutral' },
  'in-progress': { label: 'In progress', tone: 'brand' },
  complete: { label: 'Complete', tone: 'success' },
  'missing-required': { label: 'Missing required fields', tone: 'warning' },
}

/** Semantic status treatment per the ISBAR spec §34 — a badge, never a full-background section color. */
export function SectionStatusBadge({ status }: { status: SectionStatus }) {
  const meta = STATUS_META[status]
  return <StatusBadge label={meta.label} tone={meta.tone} />
}
