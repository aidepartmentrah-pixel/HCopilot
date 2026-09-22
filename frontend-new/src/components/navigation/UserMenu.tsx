import { ChevronDown, LogOut } from 'lucide-react'
import { useRef, useState } from 'react'
import { useAuth } from '@/app/providers/useAuth'
import { useClickOutside } from '@/hooks/useClickOutside'
import styles from './UserMenu.module.css'

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

/** Real authenticated identity (§10/§13) — degrades to username-only initials when `name` is blank, never a hardcoded example user. */
export function UserMenu() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  useClickOutside(containerRef, () => setOpen(false))

  if (!user) return null

  const displayName = user.name?.trim() || user.username
  const roleLabel = user.role === 'admin' ? 'Administrator' : user.role

  return (
    <div className={styles.wrapper} ref={containerRef}>
      <button type="button" className={styles.trigger} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className={styles.avatar} aria-hidden="true">
          {initialsOf(displayName)}
        </span>
        <span className={styles.identity}>
          <span className={styles.name} dir="auto">
            {displayName}
          </span>
          <span className={styles.role}>{roleLabel}</span>
        </span>
        <ChevronDown size={16} aria-hidden="true" className={styles.chevron} />
      </button>

      {open && (
        <div className={styles.menu} role="menu">
          <div className={styles.menuHeader}>
            Signed in as <strong dir="auto">{user.username}</strong>
          </div>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={logout}>
            <LogOut size={16} aria-hidden="true" />
            Sign Out
          </button>
        </div>
      )}
    </div>
  )
}
