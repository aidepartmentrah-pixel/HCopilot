import { BrainCircuit } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/app/providers/useAuth'
import { EmptyState } from '@/components/feedback/EmptyState'
import { Button } from '@/components/ui/Button'
import { hasKey } from '@/features/settings/permissions'

/** §29 — no fake/empty chart when there's no production model at all. Offers the real "Open AI & Models" action only to a user whose own `sections` actually include Settings access, per §29's own "if user has Settings permission... otherwise contact an administrator." */
export function NoProductionModelState() {
  const { user } = useAuth()
  const canOpenSettings = user ? hasKey(user.sections, 'settings') : false

  return (
    <EmptyState
      icon={<BrainCircuit size={22} />}
      title="No production prediction model available"
      description={
        canOpenSettings
          ? 'A model must be trained and promoted before patient-flow forecasts can be generated.'
          : 'A model must be trained and promoted before patient-flow forecasts can be generated. Contact an administrator.'
      }
      action={
        canOpenSettings ? (
          <Link to="/settings">
            <Button variant="secondary">Open AI & Models</Button>
          </Link>
        ) : undefined
      }
    />
  )
}
