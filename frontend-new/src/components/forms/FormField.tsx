import type { ReactNode } from 'react'
import styles from './FormField.module.css'

interface FormFieldProps {
  label: string
  htmlFor: string
  error?: string
  required?: boolean
  children: ReactNode
  /** Compact metadata under the label — e.g. a unit or normal range, not an error. */
  hint?: string
}

/** Every form field shares label/error/spacing (§14) — never assembled ad hoc per page. */
export function FormField({ label, htmlFor, error, required, children, hint }: FormFieldProps) {
  return (
    <div className={styles.field}>
      <label htmlFor={htmlFor} className={styles.label}>
        {label}
        {required && (
          <span className={styles.required} aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && <span className={styles.hint}>{hint}</span>}
      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
