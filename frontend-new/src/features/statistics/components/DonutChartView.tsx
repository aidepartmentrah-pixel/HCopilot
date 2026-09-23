import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { ChartDatum } from '../chartData'
import { categoricalColor } from '../chartPalette'
import { ChartTooltip } from './ChartTooltip'
import styles from './DonutChartView.module.css'

interface DonutChartViewProps {
  data: ChartDatum[]
  categorical?: boolean
  total?: number
  valueLabel?: string
  valueFormatter?: (v: number) => string
  height?: number
}

/** Donut + legend (§15 Acuity default; §21/§26 categorical fallback) — categories are never distinguished by color alone (§43): the legend always carries the real label text. */
export function DonutChartView({
  data,
  categorical = false,
  total,
  valueLabel,
  valueFormatter = String,
  height = 260,
}: DonutChartViewProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="label" innerRadius="55%" outerRadius="85%" paddingAngle={2}>
          {data.map((entry, index) => (
            <Cell key={entry.label} fill={entry.color ?? (categorical ? categoricalColor(index) : 'var(--brand-600)')} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip total={total} valueLabel={valueLabel} valueFormatter={valueFormatter} />} />
        <Legend
          verticalAlign="bottom"
          iconType="circle"
          formatter={(value: string) => <span className={styles.legendLabel}>{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
