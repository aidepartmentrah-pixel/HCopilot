import { AlertTriangle, BedDouble, Clock, Users } from 'lucide-react'
import { MetricCard } from '@/components/ui/MetricCard'
import styles from './SummaryStatRow.module.css'

interface SummaryStatRowProps {
  occupied: number
  available: number
  withoutBed: number
  waitingOverThreshold: number
}

/** Compact — Occupied/Available/Without Bed/Waiting>5min, not 6-7 oversized KPI cards (§21). */
export function SummaryStatRow({ occupied, available, withoutBed, waitingOverThreshold }: SummaryStatRowProps) {
  return (
    <div className={styles.row}>
      <MetricCard label="Occupied" value={occupied} icon={<BedDouble size={18} />} tone="danger" />
      <MetricCard label="Available" value={available} icon={<BedDouble size={18} />} tone="success" />
      <MetricCard label="Without Bed" value={withoutBed} icon={<Users size={18} />} />
      <MetricCard
        label="Waiting > 5 min"
        value={waitingOverThreshold}
        icon={<Clock size={18} />}
        tone={waitingOverThreshold > 0 ? 'warning' : 'neutral'}
      />
      {waitingOverThreshold > 0 && (
        <div className={styles.alert} role="status">
          <AlertTriangle size={16} aria-hidden="true" />
          {waitingOverThreshold} patient{waitingOverThreshold === 1 ? '' : 's'} waiting over 5 minutes without triage
        </div>
      )}
    </div>
  )
}
