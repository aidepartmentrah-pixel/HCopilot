import type { ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import type { ChartDatum } from '../chartData'
import { useChartViewPreference } from '../useChartViewPreference'
import type { ChartView } from '../useChartViewPreference'
import { AnalyticsTableView } from './AnalyticsTableView'
import { BarChartView } from './BarChartView'
import { ChartTypeSwitcher } from './ChartTypeSwitcher'
import { DonutChartView } from './DonutChartView'
import { LineChartView } from './LineChartView'
import styles from './AnalyticsCard.module.css'

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

interface AnalyticsCardProps {
  title: string
  /** Inline summary metrics under the title, e.g. "Avg 27.2 min · Median 0 min · n=175" (§40). */
  summary?: string
  data: ChartDatum[]
  allowedViews: ChartView[]
  defaultView: ChartView
  /** Per-card visualization-preference persistence key (§11) — omit to not persist. */
  storageKey?: string
  /** Bar-chart orientation for this dataset when the view is 'bar' (§20/§28). */
  barOrientation?: 'column' | 'horizontal'
  /** Use the restrained categorical palette instead of single-series indigo (§26) — for multi-category donuts/bars with no per-datum semantic color already set. */
  categorical?: boolean
  total?: number
  valueLabel?: string
  valueFormatter?: (v: number) => string
  isLoading?: boolean
  isError?: boolean
  onRetry?: () => void
  emptyMessage?: string
  /** Extra header control, e.g. the Arrivals Hour/Day dimension toggle (§17/§49). */
  headerExtra?: ReactNode
  /** Fixed companion content shown below the chart in every non-table view — e.g. Acuity's compact ESI breakdown table (§15). */
  footer?: ReactNode
  height?: number
}

/**
 * The reusable analytics-card system (§8) every Statistics chart is built
 * on: consistent header, valid-only chart switching, tooltip/table/empty/
 * error/loading states, and localStorage-opt-in view persistence.
 */
export function AnalyticsCard({
  title,
  summary,
  data,
  allowedViews,
  defaultView,
  storageKey,
  barOrientation = 'column',
  categorical = false,
  total,
  valueLabel,
  valueFormatter,
  isLoading,
  isError,
  onRetry,
  emptyMessage = 'No data available for this period.',
  headerExtra,
  footer,
  height,
}: AnalyticsCardProps) {
  const [view, setView] = useChartViewPreference(storageKey, defaultView, allowedViews)
  const isEmpty = !isLoading && !isError && data.every((d) => d.value === 0)

  return (
    <Card className={styles.card} data-testid={`analytics-card-${slugify(title)}`}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>{title}</h3>
          {summary && <p className={styles.summary}>{summary}</p>}
        </div>
        <div className={styles.headerControls}>
          {headerExtra}
          <ChartTypeSwitcher value={view} allowedViews={allowedViews} onChange={setView} />
        </div>
      </div>

      <div className={styles.body}>
        {isLoading && <LoadingState label="Loading…" />}
        {!isLoading && isError && <ErrorState description={`${title} unavailable`} onRetry={onRetry} />}
        {!isLoading && !isError && isEmpty && <EmptyState title={emptyMessage} />}
        {!isLoading && !isError && !isEmpty && (
          <>
            {view === 'bar' && (
              <BarChartView
                data={data}
                orientation={barOrientation}
                categorical={categorical}
                total={total}
                valueLabel={valueLabel}
                valueFormatter={valueFormatter}
                height={height}
              />
            )}
            {view === 'line' && (
              <LineChartView data={data} total={total} valueLabel={valueLabel} valueFormatter={valueFormatter} height={height} />
            )}
            {view === 'donut' && (
              <DonutChartView
                data={data}
                categorical={categorical}
                total={total}
                valueLabel={valueLabel}
                valueFormatter={valueFormatter}
                height={height}
              />
            )}
            {view === 'table' && <AnalyticsTableView data={data} total={total} valueLabel={valueLabel} valueFormatter={valueFormatter} />}
            {view !== 'table' && footer}
          </>
        )}
      </div>
    </Card>
  )
}
