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
        <option value="" disabled hidden>
          {placeholder}
        </option>
      )}
      {children}
    </select>
  ),
)
Select.displayName = 'Select'
