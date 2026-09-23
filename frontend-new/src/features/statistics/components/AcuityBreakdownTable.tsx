import type { AcuityBreakdownStats } from '@/types/statistics'
import { acuityBarColor } from '../acuityColor'
import styles from './AcuityBreakdownTable.module.css'

interface AcuityBreakdownTableProps {
  breakdown: AcuityBreakdownStats['acuity_breakdown']
}

/** Compact ESI breakdown table (§15) — the fixed companion to the Acuity donut, not a switchable view: Level | Count | Avg Wait | Avg LOS, always visible. */
export function AcuityBreakdownTable({ breakdown }: AcuityBreakdownTableProps) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Level</th>
          <th>Count</th>
          <th>Avg Wait</th>
          <th>Avg LOS</th>
        </tr>
      </thead>
      <tbody>
        {breakdown.map((row) => (
          <tr key={row.level}>
            <td>
              <span className={styles.levelDot} style={{ background: acuityBarColor(row.level) }} aria-hidden="true" />
              ESI {row.level}
            </td>
            <td>{row.count}</td>
            <td>{row.avg_wait_min != null ? `${Math.round(row.avg_wait_min)}m` : '—'}</td>
            <td>{row.avg_los_hours != null ? `${row.avg_los_hours}h` : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
