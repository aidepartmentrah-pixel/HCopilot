import { Loader2 } from 'lucide-react'
import { type ButtonHTMLAttributes, forwardRef } from 'react'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading = false, disabled, className, children, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        className={[styles.button, styles[variant], styles[size], className].filter(Boolean).join(' ')}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...rest}
      >
        {loading && <Loader2 className={styles.spinner} size={16} aria-hidden="true" />}
        {children}
      </button>
    )
  },
)
Button.displayName = 'Button'
