import styles from './StatusBadge.module.css'

export type StatusTone = 'success' | 'warning' | 'danger' | 'critical' | 'occupied' | 'waiting' | 'neutral' | 'brand'

interface StatusBadgeProps {
  label: string
  tone: StatusTone
  className?: string
}

/**
 * Status is never color-only (§18): a labeled dot, always with real text.
 */
export function StatusBadge({ label, tone, className }: StatusBadgeProps) {
  return (
    <span className={[styles.statusBadge, styles[tone], className].filter(Boolean).join(' ')}>
      <span className={styles.dot} aria-hidden="true" />
      {label}
    </span>
  )
}
