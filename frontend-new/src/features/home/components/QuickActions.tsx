import { ArrowRight, BarChart3, BedDouble, ClipboardPlus, History } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import styles from './QuickActions.module.css'

const SECONDARY_ACTIONS = [
  { to: '/live-er', label: 'Open Live ER', description: 'View current patient placement', icon: <BedDouble size={20} /> },
  { to: '/history', label: 'View History', description: 'Search previous ER encounters', icon: <History size={20} /> },
  { to: '/statistics', label: 'Review Statistics', description: 'Explore ER trends and analytics', icon: <BarChart3 size={20} /> },
]

/** One action (New ISBAR Entry) is emphasized primary; the rest stay secondary (Dashboard spec §7/§22). */
export function QuickActions() {
  return (
    <section aria-label="Quick Actions">
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Quick Actions</h2>
        <p className={styles.sectionSubtitle}>Common tasks, one click away.</p>
      </div>
      <div className={styles.grid}>
        <Link to="/isbar" className={styles.primaryAction}>
          <span className={styles.primaryIcon} aria-hidden="true">
            <ClipboardPlus size={22} />
          </span>
          <span className={styles.primaryText}>
            <span className={styles.primaryLabel}>New ISBAR Entry</span>
            <span className={styles.primaryDescription}>Create a new ER handover</span>
          </span>
          <ArrowRight size={18} aria-hidden="true" className={styles.primaryArrow} />
        </Link>

        {SECONDARY_ACTIONS.map((action) => (
          <Link key={action.to} to={action.to} className={styles.secondaryLink}>
            <Card padding="sm" className={styles.secondaryCard}>
              <span className={styles.secondaryIcon} aria-hidden="true">
                {action.icon}
              </span>
              <span>
                <span className={styles.secondaryLabel}>{action.label}</span>
                <span className={styles.secondaryDescription}>{action.description}</span>
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  )
}
