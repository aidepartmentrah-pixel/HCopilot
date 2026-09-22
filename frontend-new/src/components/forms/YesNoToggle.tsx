import styles from './YesNoToggle.module.css'

interface YesNoToggleProps {
  id: string
  value: string | null | undefined
  onChange: (value: string) => void
  disabled?: boolean
  options?: readonly string[]
  /** Display text override per option value (e.g. NKA -> "No known allergies") — the stored value stays the short form. */
  labels?: Record<string, string>
}

/**
 * A segmented Yes/No (or small allow-list) control — used for the ~10
 * binary ISBAR fields (telemetry, edema, npo, fall_risk, …) instead of a
 * dropdown, since a 2-3-option choice reads faster as buttons than as a
 * select requiring an extra click to open (§35 — a documented, sensible
 * assumption, not a spec requirement).
 */
export function YesNoToggle({ id, value, onChange, disabled, options = ['Yes', 'No'], labels }: YesNoToggleProps) {
  return (
    <div className={styles.toggle} role="radiogroup" id={id}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          disabled={disabled}
          className={[styles.option, value === option ? styles.selected : ''].filter(Boolean).join(' ')}
          onClick={() => onChange(option)}
        >
          {labels?.[option] ?? option}
        </button>
      ))}
    </div>
  )
}
