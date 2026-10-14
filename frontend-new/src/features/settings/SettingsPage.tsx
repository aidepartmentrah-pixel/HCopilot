import { Lock, ShieldAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { canAccessSettingsArea, isAdmin } from '@/app/access'
import { useAuth } from '@/app/providers/useAuth'
import { EmptyState } from '@/components/feedback/EmptyState'
import { PageHeader } from '@/components/layout/PageHeader'
import { AccountsSettings } from './components/AccountsSettings'
import { AiModelsSettings } from './components/AiModelsSettings'
import { BedsSettings } from './components/BedsSettings'
import { DoctorsSettings } from './components/DoctorsSettings'
import { IntegrationsSettings } from './components/IntegrationsSettings'
import { NursesSettings } from './components/NursesSettings'
import { SettingsSidebar } from './components/SettingsSidebar'
import { WardsSettings } from './components/WardsSettings'
import { SETTINGS_NAV, type SettingsNavGroup } from './settingsNav'
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
  const { user } = useAuth()
  // Only the Settings areas this account may open (admins: all). Same rule as the old UI's settings_tabs.
  const groups: SettingsNavGroup[] = useMemo(
    () =>
      SETTINGS_NAV.map((group) => ({
        ...group,
        items: group.items.filter((item) => (item.adminOnly ? isAdmin(user) : canAccessSettingsArea(user, item.tabKeys ?? []))),
      })).filter((group) => group.items.length > 0),
    [user],
  )
  const allowedIds = groups.flatMap((g) => g.items.map((i) => i.id))
  const [chosenId, setChosenId] = useState('beds')
  const activeId = allowedIds.includes(chosenId) ? chosenId : (allowedIds[0] ?? '')
  const ActivePanel = PANELS[activeId]

  if (!ActivePanel) {
    return (
      <>
        <PageHeader title="Settings" subtitle="Manage application configuration" />
        <EmptyState
          icon={<Lock size={24} />}
          title="No settings are enabled for your account"
          description="Ask an administrator to give your account access to the Settings areas you need."
        />
      </>
    )
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Manage application configuration" />
      <div className={styles.layout}>
        <SettingsSidebar groups={groups} activeId={activeId} onSelect={setChosenId} />
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
