import { format } from 'date-fns'
import { Activity } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { LoadingState } from '@/components/feedback/LoadingState'
import { EmptyState } from '@/components/feedback/EmptyState'
import { usePatients } from '@/hooks/usePatients'
import { useHistory } from '@/hooks/useHistory'
import { buildRecentActivity } from '../recentActivity'
import styles from './RecentActivityPanel.module.css'

export function RecentActivityPanel() {
  const patients = usePatients()
  const history = useHistory()

  const isLoading = patients.isLoading || history.isLoading
  const isError = patients.isError && history.isError

  const items = patients.data && history.data ? buildRecentActivity(patients.data.patients, history.data.patients) : []

  return (
    <Card className={styles.panel} data-testid="recent-activity-panel">
      <div className={styles.header}>
        <Activity size={18} aria-hidden="true" />
        <h2 className={styles.title}>Recent ER Activity</h2>
      </div>

      {isLoading && <LoadingState label="Loading recent activity…" />}
      {!isLoading && isError && <EmptyState title="Recent activity unavailable" description="Couldn't load patient or history data." />}
      {!isLoading && !isError && items.length === 0 && <EmptyState title="No recent activity" description="Nothing to show yet today." />}

      {!isLoading && !isError && items.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Time</th>
              <th>Patient</th>
              <th>Event</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td className={styles.time}>{format(new Date(item.time), 'HH:mm')}</td>
                <td dir="auto">{item.patientName}</td>
                <td>{item.event}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}
