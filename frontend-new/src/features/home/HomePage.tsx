import { BarChart3, BedDouble, ClipboardPlus, History } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/layout/PageHeader'
import styles from './HomePage.module.css'

const SHORTCUTS = [
  { to: '/isbar', label: 'ER ISBAR Entry', description: 'Create a new structured handover', icon: <ClipboardPlus size={22} /> },
  { to: '/live-er', label: 'Live ER', description: 'See current bed and patient placement', icon: <BedDouble size={22} /> },
  { to: '/history', label: 'History', description: 'Search and review previous ER stays', icon: <History size={22} /> },
  { to: '/statistics', label: 'Statistics', description: 'ER performance and patient-flow analytics', icon: <BarChart3 size={22} /> },
]

export function HomePage() {
  return (
    <>
      <PageHeader title="HCopilot" subtitle="Emergency Department overview" />
      <div className={styles.grid}>
        {SHORTCUTS.map((item) => (
          <Link key={item.to} to={item.to} className={styles.cardLink}>
            <Card>
              <span className={styles.icon} aria-hidden="true">
                {item.icon}
              </span>
              <h2 className={styles.cardTitle}>{item.label}</h2>
              <p className={styles.cardDescription}>{item.description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  )
}
