import styles from './ESIScaleSelector.module.css'

const LEVELS = [
  { value: 1, label: '1', description: 'Immediate' },
  { value: 2, label: '2', description: 'Emergent' },
  { value: 3, label: '3', description: 'Urgent' },
  { value: 4, label: '4', description: 'Less Urgent' },
  { value: 5, label: '5', description: 'Non-Urgent' },
] as const

interface ESIScaleSelectorProps {
  id: string
  value: number | null | undefined
  onChange: (value: number) => void
  disabled?: boolean
  invalid?: boolean
}

/** Full visible ESI 1-5 scale (ISBAR spec §12) — never a generic dropdown for triage acuity. */
export function ESIScaleSelector({ id, value, onChange, disabled, invalid }: ESIScaleSelectorProps) {
  return (
    <div className={styles.wrapper}>
      <div
        className={[styles.scale, invalid ? styles.invalid : ''].filter(Boolean).join(' ')}
        role="radiogroup"
        id={id}
        aria-label="Acuity (ESI)"
      >
        {LEVELS.map((level) => (
          <button
            key={level.value}
            type="button"
            role="radio"
            aria-checked={value === level.value}
            disabled={disabled}
            className={[styles.level, styles[`level${level.value}`], value === level.value ? styles.selected : ''].filter(Boolean).join(' ')}
            onClick={() => onChange(level.value)}
          >
            <span className={styles.number}>{level.label}</span>
            <span className={styles.description}>{level.description}</span>
          </button>
        ))}
      </div>
      <div className={styles.legend}>
        <span>Most severe</span>
        <span>Urgent</span>
        <span>Least severe</span>
      </div>
    </div>
  )
}
