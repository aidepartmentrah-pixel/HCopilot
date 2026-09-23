import type { ChartDatum } from '../chartData'
import styles from './ChartTooltip.module.css'

interface RechartsTooltipPayloadEntry {
  payload: ChartDatum
}

interface ChartTooltipProps {
  active?: boolean
  payload?: RechartsTooltipPayloadEntry[]
  /** Denominator for the "% of documented stays" line — omitted when the dataset has no meaningful total (e.g. a KPI with no sample concept). */
  total?: number
  valueLabel?: string
  valueFormatter?: (v: number) => string
}

/** Shared recharts custom tooltip (§27) — real value, real % of the real total, plus any dataset-specific extra lines a transform function already computed. */
export function ChartTooltip({ active, payload, total, valueLabel = 'Count', valueFormatter = String }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  const datum = payload[0].payload
  const pct = total && total > 0 ? (datum.value / total) * 100 : null

  return (
    <div className={styles.tooltip} role="tooltip">
      <p className={styles.label} dir="auto">
        {datum.label}
      </p>
      <p className={styles.value}>
        {valueFormatter(datum.value)} {valueLabel}
      </p>
      {pct != null && <p className={styles.meta}>{pct.toFixed(1)}% of documented stays</p>}
      {datum.extra?.map((line) => (
        <p key={line} className={styles.meta}>
          {line}
        </p>
      ))}
    </div>
  )
}
