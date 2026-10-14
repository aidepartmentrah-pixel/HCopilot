import type { SettingsNavGroup } from '../settingsNav'
import styles from './SettingsSidebar.module.css'

interface SettingsSidebarProps {
  /** Already filtered to what the signed-in user may open. */
  groups: SettingsNavGroup[]
  activeId: string
  onSelect: (id: string) => void
}

export function SettingsSidebar({ groups, activeId, onSelect }: SettingsSidebarProps) {
  return (
    <nav className={styles.sidebar} aria-label="Settings">
      {groups.map((group) => (
        <div key={group.label} className={styles.group}>
          <h3 className={styles.groupLabel}>{group.label}</h3>
          {group.items.map((item) => {
            const Icon = item.icon
            const active = item.id === activeId
            return (
              <button
                key={item.id}
                type="button"
                className={[styles.item, active ? styles.active : ''].filter(Boolean).join(' ')}
                onClick={() => onSelect(item.id)}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={16} />
                {item.label}
              </button>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
