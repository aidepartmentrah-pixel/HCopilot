import { BedDouble, ClipboardCheck, Clock, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { MetricCard } from '@/components/ui/MetricCard'
import { usePatients } from '@/hooks/usePatients'
import { useBedStats, useBedlessPatients } from '@/hooks/useBeds'
import { useHistory } from '@/hooks/useHistory'
import { countDischargedToday } from '../kpis'
import styles from './KpiRow.module.css'

/** Each card degrades independently on its own query's failure (Dashboard spec §19) — one slow/failed source never blocks the others. */
export function KpiRow() {
  const patients = usePatients()
  const bedStats = useBedStats()
  const bedless = useBedlessPatients()
  const history = useHistory()

  return (
    <div className={styles.row}>
      <KpiSlot
        label="Active ER Patients"
        icon={<Users size={20} />}
        tone="neutral"
        isLoading={patients.isLoading}
        isError={patients.isError}
        value={patients.data ? patients.data.patients.length : null}
      />
      <KpiSlot
        label="Occupied Beds"
        icon={<BedDouble size={20} />}
        tone="success"
        isLoading={bedStats.isLoading}
        isError={bedStats.isError}
        value={bedStats.data ? `${bedStats.data.occupied} / ${bedStats.data.total_beds}` : null}
        meta={bedStats.data ? `${bedStats.data.occupancy_rate}% occupancy` : undefined}
      />
      <KpiSlot
        label="Waiting Without Bed"
        icon={<Clock size={20} />}
        tone="warning"
        isLoading={bedless.isLoading}
        isError={bedless.isError}
        value={bedless.data ? bedless.data.total : null}
      />
      <KpiSlot
        label="Discharged Today"
        icon={<ClipboardCheck size={20} />}
        tone="neutral"
        isLoading={history.isLoading}
        isError={history.isError}
        value={history.data ? countDischargedToday(history.data.patients, new Date()) : null}
      />
    </div>
  )
}

interface KpiSlotProps {
  label: string
  icon: ReactNode
  tone: 'neutral' | 'success' | 'warning'
  isLoading: boolean
  isError: boolean
  value: string | number | null
  meta?: string
}

function KpiSlot({ label, icon, tone, isLoading, isError, value, meta }: KpiSlotProps) {
  if (isError) return <MetricCard label={label} value="Unavailable" tone="danger" icon={icon} />
  if (isLoading || value == null) return <MetricCard label={label} value="…" tone="neutral" icon={icon} />
  return (
    <MetricCard
      label={label}
      value={
        <>
          {value}
          {meta && <span className={styles.meta}> · {meta}</span>}
        </>
      }
      tone={tone}
      icon={icon}
    />
  )
}
