import { useState } from 'react'
import { ModelRegistryTab } from './ModelRegistryTab'
import { SettingsTabs } from './SettingsTabs'
import { TrainingTab } from './TrainingTab'
import styles from './ResourceSettings.module.css'

const TABS = [
  { id: 'registry', label: 'Model Registry' },
  { id: 'training', label: 'Training' },
]

/** One destination, two internal tabs (§17/§40) — not two unrelated top-level Settings entries. */
export function AiModelsSettings() {
  const [activeTab, setActiveTab] = useState('registry')

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <h2 className={styles.title}>AI & Models</h2>
      </div>
      <SettingsTabs tabs={TABS} activeId={activeTab} onSelect={setActiveTab} />
      {activeTab === 'registry' ? <ModelRegistryTab /> : <TrainingTab />}
    </div>
  )
}
