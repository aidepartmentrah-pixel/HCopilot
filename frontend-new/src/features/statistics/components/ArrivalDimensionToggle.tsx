import styles from './ArrivalDimensionToggle.module.css'

export type ArrivalDimension = 'hour' | 'day'

interface ArrivalDimensionToggleProps {
  value: ArrivalDimension
  onChange: (dimension: ArrivalDimension) => void
}

/** The Arrivals card's Hour of Day / Day of Week dimension toggle (§17/§49) — one card, two data shapes, never two near-duplicate cards. */
export function ArrivalDimensionToggle({ value, onChange }: ArrivalDimensionToggleProps) {
  return (
    <div className={styles.toggle} role="group" aria-label="Arrivals dimension">
      <button
        type="button"
        className={[styles.option, value === 'hour' ? styles.active : ''].join(' ')}
        aria-pressed={value === 'hour'}
        onClick={() => onChange('hour')}
      >
        Hour of Day
      </button>
      <button
        type="button"
        className={[styles.option, value === 'day' ? styles.active : ''].join(' ')}
        aria-pressed={value === 'day'}
        onClick={() => onChange('day')}
      >
        Day of Week
      </button>
    </div>
  )
}
