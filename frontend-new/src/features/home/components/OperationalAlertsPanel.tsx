import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { LoadingState } from '@/components/feedback/LoadingState'
import { useOperationalAlerts } from '../useOperationalAlerts'
import type { AlertSeverity } from '../alertRules'
import styles from './OperationalAlertsPanel.module.css'

const SEVERITY_CLASS: Record<AlertSeverity, string> = {
  info: styles.info,
  warning: styles.warning,
  critical: styles.critical,
}

/** Only the 3 rules the spec defines (§9) — never a fabricated clinical alert. */
export function OperationalAlertsPanel() {
  const { alerts, isLoading } = useOperationalAlerts()

  return (
    <Card className={styles.panel} data-testid="operational-alerts-panel">
      <div className={styles.header}>
        <AlertTriangle size={18} aria-hidden="true" />
        <h2 className={styles.title}>Operational Alerts</h2>
      </div>

      {isLoading && <LoadingState label="Checking operational status…" />}

      {!isLoading && alerts.length === 0 && (
        <div className={styles.empty}>
          <CheckCircle2 size={18} aria-hidden="true" className={styles.emptyIcon} />
          No active alerts.
        </div>
      )}

      {!isLoading && alerts.length > 0 && (
        <ul className={styles.list}>
          {alerts.map((alert) => (
            <li key={alert.id} className={[styles.alert, SEVERITY_CLASS[alert.severity]].join(' ')}>
              {alert.message}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
