import { BarChart3, BedDouble, ClipboardPlus, History, Home, Settings } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
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
}

/**
 * Real HCopilot modules only (§7/NF1.3) — Home + the 5 pages this rewrite
 * targets (master prompt §25). Flow Prediction/Scheduling/Simulation exist
 * in the old frontend but aren't part of this rewrite's scope yet (§39
 * step 11 — "remaining feature parity pages" is deliberately later);
 * left out of nav rather than linked to a page that doesn't exist here.
 */
const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: <Home size={18} /> },
  { to: '/isbar', label: 'ER ISBAR Entry', icon: <ClipboardPlus size={18} /> },
  { to: '/live-er', label: 'Live ER', icon: <BedDouble size={18} /> },
  { to: '/history', label: 'History', icon: <History size={18} /> },
  { to: '/statistics', label: 'Statistics', icon: <BarChart3 size={18} /> },
  { to: '/settings', label: 'Settings', icon: <Settings size={18} /> },
]

/**
 * The one reusable application shell (Global Theme spec §3) — identical on
 * every page. Branded indigo/navy per §4, never redefined per page.
 */
export function TopNavigation() {
  const { alerts } = useOperationalAlerts()

  return (
    <header className={styles.header}>
      <NavLink to="/" className={styles.brand} end>
        <HCopilotMark size={30} />
        <span className={styles.brandName}>HCopilot</span>
      </NavLink>

      <nav className={styles.nav} aria-label="Primary">
        {NAV_ITEMS.map((item) => (
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
