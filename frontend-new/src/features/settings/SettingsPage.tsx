import { ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { AccountsSettings } from './components/AccountsSettings'
import { AiModelsSettings } from './components/AiModelsSettings'
import { BedsSettings } from './components/BedsSettings'
import { DoctorsSettings } from './components/DoctorsSettings'
import { IntegrationsSettings } from './components/IntegrationsSettings'
import { NursesSettings } from './components/NursesSettings'
import { SettingsSidebar } from './components/SettingsSidebar'
import { WardsSettings } from './components/WardsSettings'
import styles from './SettingsPage.module.css'

const PANELS: Record<string, React.ComponentType> = {
  beds: BedsSettings,
  doctors: DoctorsSettings,
  nurses: NursesSettings,
  wards: WardsSettings,
  integrations: IntegrationsSettings,
  'ai-models': AiModelsSettings,
  accounts: AccountsSettings,
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
          {/* Compact, always-visible notice (§4) — replaces the old huge permanent Restricted Area banner; contextual confirmations on each sensitive action carry the real warning weight instead. */}
          <div className={styles.notice}>
            <ShieldAlert size={16} aria-hidden="true" />
            <span>
              <strong>Administrative Settings —</strong> changes made here may affect live HCopilot operation.
            </span>
          </div>
          <ActivePanel />
        </div>
      </div>
    </>
  )
}
