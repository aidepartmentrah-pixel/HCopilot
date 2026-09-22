import { UserRound } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ACUITY_TONE } from '../constants'
import styles from './PatientIdentityBanner.module.css'

interface PatientIdentityBannerProps {
  name: string
  age?: number | null
  gender?: string | null
  arrivalTime: string
  patientNumber: number
  acuity?: number | null
  onChangePatient: () => void
}

/** The active patient must be impossible to miss (§20) — shown only once a stay is loaded. */
export function PatientIdentityBanner({
  name,
  age,
  gender,
  arrivalTime,
  patientNumber,
  acuity,
  onChangePatient,
}: PatientIdentityBannerProps) {
  return (
    <div className={styles.banner}>
      <div className={styles.avatar} aria-hidden="true">
        <UserRound size={22} />
      </div>
      <div className={styles.identity}>
        <div className={styles.nameRow}>
          <span className={styles.name} dir="auto">
            {name || 'Unnamed patient'}
          </span>
          {acuity != null && <StatusBadge label={`ESI ${acuity}`} tone={ACUITY_TONE[acuity] ?? 'neutral'} />}
        </div>
        <div className={styles.meta}>
          {[age != null ? `${age}y` : null, gender, `Patient #${patientNumber}`, `Arrived ${formatArrival(arrivalTime)}`]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>
      <Button variant="secondary" size="sm" onClick={onChangePatient}>
        Change Patient
      </Button>
    </div>
  )
}

function formatArrival(value: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
