import { forwardRef, type InputHTMLAttributes } from 'react'
import styles from './Controls.module.css'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

// dir="auto" by default (§19) — almost every text field in this app can
// hold Arabic content (names, complaints, clinical notes); a numeric/date
// input just ignores the attribute, so defaulting it everywhere is
// harmless and means a future new field doesn't need to remember to set it.
export const Input = forwardRef<HTMLInputElement, InputProps>(({ invalid, className, dir = 'auto', ...rest }, ref) => (
  <input
    ref={ref}
    dir={dir}
    className={[styles.control, invalid ? styles.invalid : '', className].filter(Boolean).join(' ')}
    {...rest}
  />
))
Input.displayName = 'Input'
