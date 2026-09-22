import { Server } from 'lucide-react'
import type { StatusTone } from '@/components/ui/StatusBadge'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Card } from '@/components/ui/Card'
import { useHealth } from '@/hooks/useHealth'
import { useErRoster } from '@/hooks/useErRoster'
import styles from './SystemStatusPanel.module.css'

interface StatusRow {
  label: string
  tone: StatusTone
  text: string
}

/**
 * Only real, checkable HCopilot dependencies (§10/§25 — never PACS/LIS/
 * imaging/lab unless genuinely integrated). `/health` (backend/app.py)
 * deliberately has no DB access and reports only overall backend
 * liveness — it does not break down Database separately, so Database is
 * left out here rather than inferred/faked (documented gap, V2.0 log and
 * this slice's log). Hospital Directory and "ER Current Visits" are the
 * same integration in this system (one endpoint,
 * /api/hospital-directory/er/current-visits) — shown as one real row
 * instead of two cosmetically-separate ones that would always agree.
 */
export function SystemStatusPanel() {
  const health = useHealth()
  const roster = useErRoster()

  const rows: StatusRow[] = [
    {
      label: 'HCopilot Backend',
      ...(health.isLoading
        ? { tone: 'neutral' as StatusTone, text: 'Checking…' }
        : health.isError
          ? { tone: 'danger' as StatusTone, text: 'Unavailable' }
          : { tone: 'success' as StatusTone, text: 'Operational' }),
    },
    {
      label: 'Hospital Directory / ER Roster API',
      ...(roster.isLoading
        ? { tone: 'neutral' as StatusTone, text: 'Checking…' }
        : roster.isError
          ? { tone: 'danger' as StatusTone, text: 'Unavailable' }
          : roster.data?.status !== 'ok'
            ? { tone: 'warning' as StatusTone, text: 'Degraded' }
            : { tone: 'success' as StatusTone, text: 'Operational' }),
    },
  ]

  return (
    <Card className={styles.panel} data-testid="system-status-panel">
      <div className={styles.header}>
        <Server size={18} aria-hidden="true" />
        <h2 className={styles.title}>System Status</h2>
      </div>
      <ul className={styles.list}>
        {rows.map((row) => (
          <li key={row.label} className={styles.row}>
            <span className={styles.label}>{row.label}</span>
            <StatusBadge tone={row.tone} label={row.text} />
          </li>
        ))}
      </ul>
    </Card>
  )
}
