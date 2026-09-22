import { humanize } from '@/utils/humanize'
import styles from './TileSingleSelect.module.css'

interface Option {
  value: string
  label: string
}

interface TileSingleSelectProps {
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
 * Rectangular single-select tiles — the old frontend's `choiceStyle: 'tiles'`
 * radio-groups (Clinical Status, Isolation Precautions, Neuro Status,
 * Swallow Assessment, Voiding, Discharge/Transfer Plan), restored per
 * ISBAR spec §18/§23: a small, meaningful choice set shown visibly rather
 * than hidden inside a dropdown.
 */
export function TileSingleSelect({ id, value, onChange, options, disabled }: TileSingleSelectProps) {
  return (
    <div className={styles.tiles} role="radiogroup" id={id}>
      {options.map((raw) => {
        const option = normalize(raw)
        const isSelected = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            className={[styles.tile, isSelected ? styles.selected : ''].filter(Boolean).join(' ')}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
