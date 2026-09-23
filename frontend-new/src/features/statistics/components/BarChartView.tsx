import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ChartDatum } from '../chartData'
import { categoricalColor } from '../chartPalette'
import { ChartTooltip } from './ChartTooltip'

interface BarChartViewProps {
  data: ChartDatum[]
  /** 'column' (default) for ordered/time-like distributions; 'horizontal' for ranked category lists with long labels (§20/§28). */
  orientation?: 'column' | 'horizontal'
  categorical?: boolean
  total?: number
  valueLabel?: string
  valueFormatter?: (v: number) => string
  height?: number
}

/** Column or ranked-horizontal bar chart (§13/§14/§20 defaults) sharing one tooltip/color system. */
export function BarChartView({
  data,
  orientation = 'column',
  categorical = false,
  total,
  valueLabel,
  valueFormatter = String,
  height = 260,
}: BarChartViewProps) {
  const isHorizontal = orientation === 'horizontal'

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout={isHorizontal ? 'vertical' : 'horizontal'}
        margin={{ top: 4, right: 12, left: isHorizontal ? 8 : 0, bottom: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" vertical={isHorizontal} horizontal={!isHorizontal} />
        {isHorizontal ? (
          <>
            <XAxis type="number" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="label"
              width={140}
              tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
              tickFormatter={(label: string) => (label.length > 20 ? `${label.slice(0, 19)}…` : label)}
            />
          </>
        ) : (
          <>
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
            <YAxis tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} allowDecimals={false} />
          </>
        )}
        <Tooltip
          cursor={{ fill: 'var(--slate-100)' }}
          content={<ChartTooltip total={total} valueLabel={valueLabel} valueFormatter={valueFormatter} />}
        />
        <Bar dataKey="value" radius={isHorizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={32}>
          {data.map((entry, index) => (
            <Cell key={entry.label} fill={entry.color ?? (categorical ? categoricalColor(index) : 'var(--brand-600)')} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
