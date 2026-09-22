import type { ReactNode } from 'react'
import styles from './Badge.module.css'

interface BadgeProps {
  children: ReactNode
  tone?: 'neutral' | 'brand'
  className?: string
}

export function Badge({ children, tone = 'neutral', className }: BadgeProps) {
  return <span className={[styles.badge, styles[tone], className].filter(Boolean).join(' ')}>{children}</span>
}
