import { Bell } from 'lucide-react'
import { useRef, useState } from 'react'
import { useClickOutside } from '@/hooks/useClickOutside'
import styles from './NotificationBell.module.css'

export interface NotificationItem {
  id: string
  message: string
}

interface NotificationBellProps {
  /**
   * No alert source is wired into the shell yet (V2.0 is shell-only — the
   * real alert rules land in V2.1's Home dashboard). Defaults to an honest
   * empty list rather than a fake badge count; V2.1 passes its real
   * `OperationalAlertsPanel` rules in here once they exist (§9 top-bar
   * requirement: "unread indicator... when appropriate").
   */
  items?: NotificationItem[]
}

export function NotificationBell({ items = [] }: NotificationBellProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  useClickOutside(containerRef, () => setOpen(false))

  return (
    <div className={styles.wrapper} ref={containerRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-label={items.length > 0 ? `Notifications, ${items.length} unread` : 'Notifications, none unread'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={18} aria-hidden="true" />
        {items.length > 0 && <span className={styles.badge}>{items.length > 9 ? '9+' : items.length}</span>}
      </button>

      {open && (
        <div className={styles.panel} role="menu">
          <div className={styles.panelHeader}>Notifications</div>
          {items.length === 0 ? (
            <div className={styles.empty}>No new notifications.</div>
          ) : (
            <ul className={styles.list}>
              {items.map((item) => (
                <li key={item.id} className={styles.item}>
                  {item.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
