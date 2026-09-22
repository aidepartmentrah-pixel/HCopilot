import { Activity, BedDouble, Clock, TimerOff, Users } from 'lucide-react'
import { MetricCard } from '@/components/ui/MetricCard'
import type { StatisticsOverview } from '@/types/statistics'
import styles from './KpiRow.module.css'

/** 4-5 primary KPIs (§23) — not 7 equally-weighted cards. Picked from overview() for headline ER-flow signal. */
export function KpiRow({ overview }: { overview: StatisticsOverview }) {
  return (
    <div className={styles.row}>
      <MetricCard label="Active Patients" value={overview.active_patients} icon={<Users size={18} />} />
      <MetricCard
        label="Avg. Wait to Bed"
        value={overview.avg_wait_to_bed_min != null ? `${Math.round(overview.avg_wait_to_bed_min)}m` : '—'}
        icon={<Clock size={18} />}
      />
      <MetricCard
        label="Occupancy"
        value={overview.occupancy_rate != null ? `${overview.occupancy_rate}%` : '—'}
        icon={<BedDouble size={18} />}
      />
      <MetricCard
        label="Avg. Length of Stay"
        value={overview.avg_los_hours != null ? `${overview.avg_los_hours}h` : '—'}
        icon={<Activity size={18} />}
      />
      <MetricCard
        label="Long Waits (>4h)"
        value={overview.long_wait_pct != null ? `${overview.long_wait_pct}%` : '—'}
        icon={<TimerOff size={18} />}
        tone={overview.long_wait_pct != null && overview.long_wait_pct > 10 ? 'warning' : 'neutral'}
      />
    </div>
  )
}
