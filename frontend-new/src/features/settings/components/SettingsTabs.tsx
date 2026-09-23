import styles from './SettingsTabs.module.css'

interface SettingsTabsProps {
  tabs: { id: string; label: string }[]
  activeId: string
  onSelect: (id: string) => void
}

/** Internal tabs local to one Settings domain (§40) — e.g. AI & Models' Model Registry/Training — never promoted to global navigation. */
export function SettingsTabs({ tabs, activeId, onSelect }: SettingsTabsProps) {
  return (
    <div className={styles.tabs} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === activeId}
          className={[styles.tab, tab.id === activeId ? styles.active : ''].filter(Boolean).join(' ')}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
