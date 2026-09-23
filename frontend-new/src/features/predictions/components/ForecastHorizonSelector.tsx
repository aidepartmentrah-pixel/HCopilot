import { FORECAST_HORIZONS } from '@/types/predictions'
import type { ForecastHorizon } from '@/types/predictions'
import styles from './ForecastHorizonSelector.module.css'

interface ForecastHorizonSelectorProps {
  value: ForecastHorizon
  onChange: (horizon: ForecastHorizon) => void
}

/** Preserves exactly the old page's supported 30/60/90-day choices (§7) — confirmed against the real backend, never invented values like 7/14/365 days. */
export function ForecastHorizonSelector({ value, onChange }: ForecastHorizonSelectorProps) {
  return (
    <div className={styles.toggle} role="radiogroup" aria-label="Forecast Horizon">
      {FORECAST_HORIZONS.map((horizon) => (
        <button
          key={horizon}
          type="button"
          role="radio"
          aria-checked={horizon === value}
          className={[styles.option, horizon === value ? styles.active : ''].filter(Boolean).join(' ')}
          onClick={() => onChange(horizon)}
        >
          {horizon} Days
        </button>
      ))}
    </div>
  )
}
