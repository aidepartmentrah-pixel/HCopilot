import { BarChart3, BedDouble, ClipboardPlus, History, Home, LineChart, Settings } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { SECTION_KEYS, canAccessSection, type SectionKey } from '@/app/access'
import { useAuth } from '@/app/providers/useAuth'
import { HCopilotMark } from '@/components/brand/HCopilotMark'
import { useOperationalAlerts } from '@/features/home/useOperationalAlerts'
import { GlobalSearch } from './GlobalSearch'
import { NotificationBell } from './NotificationBell'
import { UserMenu } from './UserMenu'
import styles from './TopNavigation.module.css'

interface NavItem {
  to: string
  label: string
  icon: ReactNode
  /** The account section that grants this page (see app/access.ts). */
  section: SectionKey
}

/**
 * Real HCopilot modules — Home + the pages this rewrite targets. V2.7
 * restores Predictions (Patient Flow), the last previously-missing page;
 * Scheduling/Simulation remain out of this rewrite's scope (see V2.6's
 * log — both were inspected and found superseded by Live ER's placement
 * board, not left out by oversight).
 */
const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: <Home size={18} />, section: SECTION_KEYS.home },
  { to: '/isbar', label: 'ER ISBAR Entry', icon: <ClipboardPlus size={18} />, section: SECTION_KEYS.isbar },
  { to: '/live-er', label: 'Live ER', icon: <BedDouble size={18} />, section: SECTION_KEYS.liveEr },
  { to: '/history', label: 'History', icon: <History size={18} />, section: SECTION_KEYS.history },
  { to: '/statistics', label: 'Statistics', icon: <BarChart3 size={18} />, section: SECTION_KEYS.statistics },
  { to: '/predictions', label: 'Predictions', icon: <LineChart size={18} />, section: SECTION_KEYS.predictions },
  { to: '/settings', label: 'Settings', icon: <Settings size={18} />, section: SECTION_KEYS.settings },
]

/**
 * The one reusable application shell (Global Theme spec §3) — identical on
 * every page. Branded indigo/navy per §4, never redefined per page.
 */
export function TopNavigation() {
  const { alerts } = useOperationalAlerts()
  const { user } = useAuth()
  const visibleItems = NAV_ITEMS.filter((item) => canAccessSection(user, item.section))

  return (
    <header className={styles.header}>
      <NavLink to="/" className={styles.brand} end>
        <HCopilotMark size={30} />
        <span className={styles.brandName}>HCopilot</span>
      </NavLink>

      <nav className={styles.nav} aria-label="Primary">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => [styles.navLink, isActive ? styles.navLinkActive : ''].filter(Boolean).join(' ')}
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className={styles.shellActions}>
        <GlobalSearch />
        <NotificationBell items={alerts.map((a) => ({ id: a.id, message: a.message }))} />
        <UserMenu />
      </div>
    </header>
  )
}
