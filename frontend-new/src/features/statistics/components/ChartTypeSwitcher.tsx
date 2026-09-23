import { BarChart3, Check, ChartPie, LineChart, Table2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useClickOutside } from '@/hooks/useClickOutside'
import { IconButton } from '@/components/ui/IconButton'
import type { ChartView } from '../useChartViewPreference'
import styles from './ChartTypeSwitcher.module.css'

const VIEW_META: Record<ChartView, { label: string; icon: typeof BarChart3 }> = {
  bar: { label: 'Bar', icon: BarChart3 },
  line: { label: 'Line', icon: LineChart },
  donut: { label: 'Donut', icon: ChartPie },
  table: { label: 'Table', icon: Table2 },
}

interface ChartTypeSwitcherProps {
  value: ChartView
  allowedViews: ChartView[]
  onChange: (view: ChartView) => void
}

/** Compact top-right chart-mode control (§10) — only offers the dataset's own valid views, never all four for symmetry (§9/§49). */
export function ChartTypeSwitcher({ value, allowedViews, onChange }: ChartTypeSwitcherProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  useClickOutside(containerRef, () => setOpen(false))

  if (allowedViews.length <= 1) return null

  const ActiveIcon = VIEW_META[value].icon

  return (
    <div className={styles.wrapper} ref={containerRef}>
      <IconButton
        icon={<ActiveIcon size={16} />}
        label={`Change visualization (currently ${VIEW_META[value].label})`}
        size="sm"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <div className={styles.menu} role="menu">
          {allowedViews.map((view) => {
            const Icon = VIEW_META[view].icon
            return (
              <button
                key={view}
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={() => {
                  onChange(view)
                  setOpen(false)
                }}
              >
                <Icon size={14} aria-hidden="true" />
                {VIEW_META[view].label}
                {view === value && <Check size={14} aria-hidden="true" className={styles.check} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
