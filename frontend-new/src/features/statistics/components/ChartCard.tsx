import type { ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/feedback/EmptyState'
import styles from './ChartCard.module.css'

interface ChartCardProps {
  title: string
  subtitle?: string
  children: ReactNode
  isEmpty?: boolean
  emptyMessage?: string
}

/** Consistent chart-card grid (§23): same padding, title style, empty state across every card. */
export function ChartCard({ title, subtitle, children, isEmpty, emptyMessage = 'No data recorded yet.' }: ChartCardProps) {
  return (
    <Card>
      <h3 className={styles.title}>{title}</h3>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      <div className={styles.body}>{isEmpty ? <EmptyState title={emptyMessage} /> : children}</div>
    </Card>
  )
}
