import styles from './BarList.module.css'

export interface BarListItem {
  label: string
  value: number
  /** Defaults to the brand sequential hue; pass a status tone's CSS var for severity-colored bars (e.g. ESI levels). */
  color?: string
}

interface BarListProps {
  items: BarListItem[]
  formatValue?: (v: number) => string
}

/** Horizontal bars, per the dataviz skill's mark spec: <=24px thick, 4px rounded end, value at the tip, no border. */
export function BarList({ items, formatValue = (v) => String(v) }: BarListProps) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <div className={styles.list}>
      {items.map((item) => (
        <div key={item.label} className={styles.row}>
          <span className={styles.label} dir="auto">
            {item.label}
          </span>
          <div className={styles.track}>
            <div
              className={styles.bar}
              style={{ width: `${(item.value / max) * 100}%`, background: item.color ?? 'var(--brand-600)' }}
            />
          </div>
          <span className={styles.value}>{formatValue(item.value)}</span>
        </div>
      ))}
    </div>
  )
}
