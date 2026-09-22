import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { BedsSettings } from './components/BedsSettings'
import { DangerZone } from './components/DangerZone'
import { DoctorsSettings } from './components/DoctorsSettings'
import { NursesSettings } from './components/NursesSettings'
import { SettingsSidebar } from './components/SettingsSidebar'
import { WardsSettings } from './components/WardsSettings'
import styles from './SettingsPage.module.css'

const PANELS: Record<string, React.ComponentType> = {
  beds: BedsSettings,
  doctors: DoctorsSettings,
  nurses: NursesSettings,
  wards: WardsSettings,
  reset: DangerZone,
}

export function SettingsPage() {
  const [activeId, setActiveId] = useState('beds')
  const ActivePanel = PANELS[activeId] ?? BedsSettings

  return (
    <>
      <PageHeader title="Settings" subtitle="Manage application configuration" />
      <div className={styles.layout}>
        <SettingsSidebar activeId={activeId} onSelect={setActiveId} />
        <div className={styles.content}>
          <ActivePanel />
        </div>
      </div>
    </>
  )
}
