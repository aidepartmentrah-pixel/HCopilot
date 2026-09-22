import { PageHeader } from '@/components/layout/PageHeader'
import { DateTimeHospital } from './components/DateTimeHospital'
import { WelcomePanel } from './components/WelcomePanel'
import { KpiRow } from './components/KpiRow'
import { QuickActions } from './components/QuickActions'
import { RecentActivityPanel } from './components/RecentActivityPanel'
import { OperationalAlertsPanel } from './components/OperationalAlertsPanel'
import { SystemStatusPanel } from './components/SystemStatusPanel'
import styles from './HomePage.module.css'

/** Operational ER overview (Dashboard spec) — replaces the old 4-shortcut launcher; answers "what's happening right now", not "where do I go". */
export function HomePage() {
  return (
    <div className={styles.page}>
      <PageHeader title="HCopilot Overview" subtitle="Central workspace for ER operations and hospital insights." actions={<DateTimeHospital />} />

      <WelcomePanel />
      <KpiRow />
      <QuickActions />

      <div className={styles.lowerGrid}>
        <RecentActivityPanel />
        <OperationalAlertsPanel />
        <SystemStatusPanel />
      </div>
    </div>
  )
}
