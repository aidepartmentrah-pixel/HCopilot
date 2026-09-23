import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ChartDatum } from '../chartData'
import { ChartTooltip } from './ChartTooltip'

interface LineChartViewProps {
  data: ChartDatum[]
  total?: number
  valueLabel?: string
  valueFormatter?: (v: number) => string
  height?: number
}

/** Single-series indigo line (§26 "Single-Series Neutral Analytics") — an alternate view for distribution/time datasets, never the default for ordinal categories like acuity (§15). */
export function LineChartView({ data, total, valueLabel, valueFormatter = String, height = 260 }: LineChartViewProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
        <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
        <YAxis tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} allowDecimals={false} />
        <Tooltip content={<ChartTooltip total={total} valueLabel={valueLabel} valueFormatter={valueFormatter} />} />
        <Line
          type="monotone"
          dataKey="value"
          stroke="var(--brand-600)"
          strokeWidth={2}
          dot={{ r: 3, fill: 'var(--brand-600)' }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
