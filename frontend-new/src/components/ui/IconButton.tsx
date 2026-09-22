import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { forwardRef } from 'react'
import styles from './IconButton.module.css'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode
  /** Required, not optional — icon-only controls must always have an accessible name (§18). */
  label: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'ghost' | 'secondary'
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, label, size = 'md', variant = 'ghost', className, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        className={[styles.iconButton, styles[size], styles[variant], className].filter(Boolean).join(' ')}
        {...rest}
      >
        {icon}
      </button>
    )
  },
)
IconButton.displayName = 'IconButton'
