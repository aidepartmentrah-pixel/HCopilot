import type { ReactNode } from 'react'
import styles from './MetricCard.module.css'

export type MetricTone = 'neutral' | 'success' | 'warning' | 'danger'

interface MetricCardProps {
  label: string
  value: ReactNode
  tone?: MetricTone
  icon?: ReactNode
}

/** Compact KPI tile — used in summary rows, not as a page's whole content (§21: no 6-7 oversized KPI cards). */
export function MetricCard({ label, value, tone = 'neutral', icon }: MetricCardProps) {
  return (
    <div className={[styles.metricCard, styles[tone]].join(' ')}>
      {icon && (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      <div>
        <div className={styles.value}>{value}</div>
        <div className={styles.label}>{label}</div>
      </div>
    </div>
  )
}
