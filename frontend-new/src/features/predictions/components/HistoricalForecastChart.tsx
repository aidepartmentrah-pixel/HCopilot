import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatForecastDate } from '../forecastChartData'
import type { ForecastChartRow } from '../forecastChartData'
import styles from './HistoricalForecastChart.module.css'

interface HistoricalForecastChartProps {
  rows: ForecastChartRow[]
  boundaryDate: string | null
}

interface TooltipPayloadEntry {
  dataKey: 'historical' | 'forecast'
  value: number
}

function ForecastTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadEntry[]; label?: string }) {
  if (!active || !payload?.length || !label) return null
  return (
    <div className={styles.tooltip} role="tooltip">
      <p className={styles.tooltipDate}>{formatForecastDate(label, true)}</p>
      {payload.map((entry) =>
        entry.value != null ? (
          <p key={entry.dataKey} className={styles.tooltipValue}>
            {entry.dataKey === 'historical' ? 'Actual Patients' : 'Predicted Patients'}: {Math.round(entry.value)}
          </p>
        ) : null,
      )}
    </div>
  )
}

/**
 * The main forecast visual (§13–§16, §21): solid indigo for historical,
 * dashed coral for forecast, a labeled boundary marker so the split is
 * obvious from more than just line style alone (§15 — "do not force users
 * to infer the boundary only from line style").
 */
export function HistoricalForecastChart({ rows, boundaryDate }: HistoricalForecastChartProps) {
  return (
    <ResponsiveContainer width="100%" height={380}>
      <LineChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => formatForecastDate(d)}
          tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
          minTickGap={40}
          label={{ value: 'Date', position: 'insideBottom', offset: -4, fontSize: 12, fill: 'var(--text-secondary)' }}
        />
        <YAxis
          tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
          allowDecimals={false}
          label={{ value: 'Number of Patients', angle: -90, position: 'insideLeft', fontSize: 12, fill: 'var(--text-secondary)' }}
        />
        <Tooltip content={<ForecastTooltip />} />
        <Legend verticalAlign="top" height={32} />
        {boundaryDate && (
          <ReferenceLine
            x={boundaryDate}
            stroke="var(--slate-300)"
            strokeDasharray="3 3"
            label={{ value: 'Forecast begins', position: 'top', fontSize: 11, fill: 'var(--text-secondary)' }}
          />
        )}
        <Line type="monotone" dataKey="historical" name="Historical Data" stroke="var(--brand-600)" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="forecast" name="Forecast" stroke="var(--waiting)" strokeWidth={2} strokeDasharray="6 4" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
