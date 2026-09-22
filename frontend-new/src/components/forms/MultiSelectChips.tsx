import { humanize } from '@/utils/humanize'
import styles from './MultiSelectChips.module.css'

interface Option {
  value: string
  label: string
}

interface MultiSelectChipsProps {
  id: string
  value: string | null | undefined
  onChange: (value: string) => void
  options: readonly (Option | string)[]
  disabled?: boolean
}

function normalize(option: Option | string): Option {
  return typeof option === 'string' ? { value: option, label: humanize(option) } : option
}

/**
 * Toggleable chips backed by a single comma-separated string — matches
 * DailyPatient.bed_history's existing multi-select convention (see
 * patient_management/api.py's ISBARDetails, e.g. immediate_concerns).
 */
export function MultiSelectChips({ id, value, onChange, options, disabled }: MultiSelectChipsProps) {
  const selected = new Set(
    (value ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  )

  function toggle(token: string) {
    const next = new Set(selected)
    if (next.has(token)) {
      next.delete(token)
    } else {
      next.add(token)
    }
    onChange(Array.from(next).join(','))
  }

  return (
    <div className={styles.chips} id={id} role="group">
      {options.map((raw) => {
        const option = normalize(raw)
        const isSelected = selected.has(option.value)
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isSelected}
            disabled={disabled}
            className={[styles.chip, isSelected ? styles.selected : ''].filter(Boolean).join(' ')}
            onClick={() => toggle(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
