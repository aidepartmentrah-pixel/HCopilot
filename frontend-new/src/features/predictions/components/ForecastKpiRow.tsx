import { Activity, Database, TrendingDown, TrendingUp } from 'lucide-react'
import { MetricCard } from '@/components/ui/MetricCard'
import type { FlowStats } from '@/types/predictions'
import styles from './ForecastKpiRow.module.css'

/** §9–§12 KPI row, restrained accents only (§12 — "do not assign arbitrary semantic good/bad colors unless thresholds exist"), all four read straight from the real dataset-wide `/stats` endpoint. */
export function ForecastKpiRow({ stats }: { stats: FlowStats }) {
  return (
    <div className={styles.row}>
      <MetricCard label="Average Daily Patients" value={stats.avg_daily_patients.toFixed(1)} icon={<Activity size={18} />} />
      <MetricCard label="Maximum Daily Patients" value={stats.max_daily_patients} icon={<TrendingUp size={18} />} />
      <MetricCard label="Minimum Daily Patients" value={stats.min_daily_patients} icon={<TrendingDown size={18} />} />
      <MetricCard label="Total Historical Records" value={stats.total_records} icon={<Database size={18} />} />
    </div>
  )
}
