import { DatabaseZap } from 'lucide-react'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'

/** §31 — not a fake zero prediction; a real, honest reason it can't forecast yet. */
export function InsufficientDataState() {
  return (
    <EmptyState
      icon={<DatabaseZap size={22} />}
      title="Not enough historical data"
      description="More ER historical data is required before HCopilot can generate a reliable patient-flow forecast."
    />
  )
}

/** §30 — the live model exists but generation failed; never the raw backend/Python exception text. */
export function ForecastFailedState({ onRetry }: { onRetry: () => void }) {
  return (
    <ErrorState
      title="Patient flow forecast unavailable"
      description="HCopilot could not generate the forecast for the selected period."
      onRetry={onRetry}
    />
  )
}
