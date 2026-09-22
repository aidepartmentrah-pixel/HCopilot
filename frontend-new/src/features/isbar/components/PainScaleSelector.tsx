import { Input } from '@/components/forms/Input'
import styles from './PainScaleSelector.module.css'

const CELLS = Array.from({ length: 11 }, (_, i) => i)

function bandOf(n: number): 'low' | 'mid' | 'high' {
  if (n <= 3) return 'low'
  if (n <= 6) return 'mid'
  return 'high'
}

interface PainScaleSelectorProps {
  id: string
  value: string | null | undefined
  onChange: (value: string) => void
  disabled?: boolean
}

/**
 * Visual 0-10 pain scale (ISBAR spec §17) — the field itself stays a plain
 * string (`pain: z.string().optional()`, unchanged from the schema) since
 * the old UI's label ("0-10 or description") shows free-text description
 * was also a supported input; keeping that alongside the restored scale
 * rather than dropping it (§43 — don't remove supported functionality
 * while restoring the visual control).
 */
export function PainScaleSelector({ id, value, onChange, disabled }: PainScaleSelectorProps) {
  const numericValue = value != null && /^\d+$/.test(value) && Number(value) <= 10 ? Number(value) : null

  return (
    <div className={styles.wrapper}>
      <div className={styles.scale} role="radiogroup" id={id} aria-label="Pain score">
        {CELLS.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={numericValue === n}
            disabled={disabled}
            className={[styles.cell, styles[bandOf(n)], numericValue === n ? styles.selected : ''].filter(Boolean).join(' ')}
            onClick={() => onChange(String(n))}
          >
            {n}
          </button>
        ))}
      </div>
      <div className={styles.legend}>
        <span>No pain</span>
        <span>Mild – Moderate</span>
        <span>Severe</span>
      </div>
      <Input
        aria-label="Pain description (if not a 0-10 score)"
        placeholder="Or describe (e.g. intermittent, positional)…"
        disabled={disabled}
        value={numericValue !== null ? '' : (value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        className={styles.description}
      />
    </div>
  )
}
