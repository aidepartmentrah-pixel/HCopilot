import { forwardRef, type SelectHTMLAttributes } from 'react'
import styles from './Controls.module.css'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ invalid, className, placeholder, children, ...rest }, ref) => (
    <select ref={ref} className={[styles.control, invalid ? styles.invalid : '', className].filter(Boolean).join(' ')} {...rest}>
      {placeholder && (
        // Not `disabled`: per the HTML spec, when no option carries `selected`
        // (the normal case for an unset react-hook-form field on mount — its
        // ref callback only imperatively sets `.value` for a *defined*
        // default), the browser auto-selects the first *non-disabled* option.
        // A disabled placeholder here was silently promoting real clinical
        // defaults (ESI "1 — Immediate", clinical status "Stable", etc.) on
        // every untouched field — never a user choice, and not visible as
        // one either. `hidden` still keeps it out of the open dropdown list.
        <option value="" hidden>
          {placeholder}
        </option>
      )}
      {children}
    </select>
  ),
)
Select.displayName = 'Select'
