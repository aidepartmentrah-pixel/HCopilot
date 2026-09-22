import type { HTMLAttributes, ReactNode } from 'react'
import styles from './Card.module.css'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  padding?: 'none' | 'sm' | 'md'
}

/** A card represents one meaningful conceptual unit (§12) — don't wrap everything in one. */
export function Card({ children, padding = 'md', className, ...rest }: CardProps) {
  return (
    <div className={[styles.card, styles[`padding-${padding}`], className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  )
}
