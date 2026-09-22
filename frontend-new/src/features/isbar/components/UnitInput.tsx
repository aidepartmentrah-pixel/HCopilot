import { forwardRef, type InputHTMLAttributes } from 'react'
import styles from './UnitInput.module.css'

interface UnitInputProps extends InputHTMLAttributes<HTMLInputElement> {
  unit: string
  invalid?: boolean
}

/** Suffix-anchored unit, always visible — never relies on the label/placeholder alone (ISBAR spec §15). */
export const UnitInput = forwardRef<HTMLInputElement, UnitInputProps>(({ unit, invalid, className, ...rest }, ref) => (
  <div className={[styles.wrapper, invalid ? styles.invalid : ''].filter(Boolean).join(' ')}>
    <input ref={ref} className={[styles.input, className].filter(Boolean).join(' ')} {...rest} />
    <span className={styles.unit} aria-hidden="true">
      {unit}
    </span>
  </div>
))
UnitInput.displayName = 'UnitInput'
