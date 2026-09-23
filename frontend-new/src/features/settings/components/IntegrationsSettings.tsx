import { KeyRound, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IconButton } from '@/components/ui/IconButton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { FormField } from '@/components/forms/FormField'
import { Input } from '@/components/forms/Input'
import { YesNoToggle } from '@/components/forms/YesNoToggle'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { useToast } from '@/components/feedback/useToast'
import {
  useHospitalDirectoryConfig,
  useMiddleNameCandidates,
  useSaveHospitalDirectoryConfig,
  useSaveMiddleNameCandidates,
  useTestHospitalDirectoryConnection,
} from '@/hooks/useHospitalDirectory'
import { formatClinicalDate } from '@/utils/dateFormat'
import type { HospitalDirectoryConfig, HospitalDirectoryConfigInput } from '@/types/settings'
import type { StatusTone } from '@/components/ui/StatusBadge'
import styles from './IntegrationsSettings.module.css'

function connectionStatus(status: 'success' | 'failure' | null): { label: string; tone: StatusTone } {
  if (status === 'success') return { label: 'Connected', tone: 'success' }
  if (status === 'failure') return { label: 'Unavailable', tone: 'danger' }
  return { label: 'Unknown', tone: 'neutral' }
}

/**
 * Hospital Directory integration (§12–§15) — ONE connection config. The ER
 * Current Visits poll (er_sync.py, the Live ER auto-discharge safety net)
 * reuses this exact same saved connection rather than having its own — no
 * separate "ER Current Visits" settings sub-page was built, since there is
 * nothing distinct to configure there (see V2.6 log).
 */
export function IntegrationsSettings() {
  const { data, dataUpdatedAt, isLoading, error, refetch } = useHospitalDirectoryConfig()
  const saveConfig = useSaveHospitalDirectoryConfig()
  const testConnection = useTestHospitalDirectoryConnection()
  const { showToast } = useToast()

  async function handleSave(body: HospitalDirectoryConfigInput) {
    try {
      await saveConfig.mutateAsync(body)
      showToast('Hospital Directory settings saved.', 'success')
    } catch {
      showToast('Hospital Directory settings could not be saved.', 'error')
    }
  }

  async function handleTest() {
    try {
      const result = await testConnection.mutateAsync()
      showToast(result.message || (result.success ? 'Connection successful.' : 'Connection failed.'), result.success ? 'success' : 'error')
    } catch {
      showToast('Could not test the connection.', 'error')
    }
  }

  if (isLoading) return <LoadingState label="Loading Hospital Directory settings…" />
  if (error || !data) return <ErrorState description="Could not load Hospital Directory settings." onRetry={() => refetch()} />

  return (
    <div className={styles.page}>
      <ConnectionForm
        // Remounts (and re-derives its local edit state) whenever fresh
        // server data lands — after the initial load, and after a
        // successful save/test-connection refetch — rather than syncing
        // props into state via an effect.
        key={dataUpdatedAt}
        config={data}
        onSave={handleSave}
        onTest={handleTest}
        isSaving={saveConfig.isPending}
        isTesting={testConnection.isPending}
      />

      <Card>
        <h3 className={styles.sectionTitle}>Patient Matching</h3>
        <p className={styles.sectionDescription}>
          Used when searching for possible patient matches when first and last names are known but a middle name is missing.
        </p>
        <MiddleNameGuessList />
      </Card>

      <p className={styles.erNote}>
        The Live ER auto-discharge safety net (ER Current Visits) uses this same connection — there is no separate configuration for
        it.
      </p>
    </div>
  )
}

interface ConnectionFormProps {
  config: HospitalDirectoryConfig
  onSave: (body: HospitalDirectoryConfigInput) => void
  onTest: () => void
  isSaving: boolean
  isTesting: boolean
}

function ConnectionForm({ config, onSave, onTest, isSaving, isTesting }: ConnectionFormProps) {
  const [baseUrl, setBaseUrl] = useState(config.base_url)
  const [timeoutSeconds, setTimeoutSeconds] = useState(String(config.timeout_seconds))
  const [verifyTls, setVerifyTls] = useState<'Yes' | 'No'>(config.verify_tls ? 'Yes' : 'No')
  const [replacingKey, setReplacingKey] = useState(!config.configured)
  const [apiKey, setApiKey] = useState('')

  const status = connectionStatus(config.last_test_status)

  return (
    <>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Hospital Directory</h2>
          <p className={styles.subtitle}>Connect HCopilot to the hospital patient directory.</p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="secondary" loading={isTesting} onClick={onTest}>
            Test Connection
          </Button>
          <Button
            loading={isSaving}
            onClick={() =>
              onSave({
                base_url: baseUrl,
                api_key: replacingKey && apiKey ? apiKey : undefined,
                timeout_seconds: Number(timeoutSeconds) || 10,
                verify_tls: verifyTls === 'Yes',
              })
            }
          >
            Save Changes
          </Button>
        </div>
      </div>

      <Card>
        <h3 className={styles.sectionTitle}>Connection</h3>
        <div className={styles.grid}>
          <FormField label="API Base URL" htmlFor="hd-base-url" required>
            <Input id="hd-base-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} dir="ltr" />
          </FormField>

          <FormField label="API Key" htmlFor="hd-api-key">
            {!replacingKey ? (
              <div className={styles.keyRow}>
                <KeyRound size={16} aria-hidden="true" />
                <span>Current credential configured{config.api_key_masked ? ` (${config.api_key_masked})` : ''}</span>
                <Button type="button" variant="secondary" size="sm" onClick={() => setReplacingKey(true)}>
                  Replace Key
                </Button>
              </div>
            ) : (
              <Input
                id="hd-api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter a new API key"
                dir="ltr"
                autoComplete="off"
              />
            )}
          </FormField>

          <FormField label="Request Timeout" htmlFor="hd-timeout" hint="Seconds">
            <Input id="hd-timeout" type="number" min={1} max={120} value={timeoutSeconds} onChange={(e) => setTimeoutSeconds(e.target.value)} />
          </FormField>

          <FormField label="Verify TLS Certificate" htmlFor="hd-tls">
            <YesNoToggle id="hd-tls" value={verifyTls} onChange={(v) => setVerifyTls(v as 'Yes' | 'No')} />
          </FormField>
        </div>

        <div className={styles.statusRow}>
          <span className={styles.statusLabel}>Connection Status</span>
          <StatusBadge label={status.label} tone={status.tone} />
          {config.last_test_at && <span className={styles.lastTested}>Last tested: {formatClinicalDate(config.last_test_at)}</span>}
        </div>
        {config.api_key_error && (
          <p className={styles.keyError}>
            {config.api_key_error === 'key_missing' ? 'No API key is configured yet.' : 'The stored API key could not be read — replace it.'}
          </p>
        )}
      </Card>
    </>
  )
}

function MiddleNameGuessList() {
  const { data, dataUpdatedAt, isLoading, error, refetch } = useMiddleNameCandidates()

  if (isLoading) return <LoadingState label="Loading candidate list…" />
  if (error || !data) return <ErrorState description="Could not load the middle-name guess list." onRetry={() => refetch()} />

  return <GuessListEditor key={dataUpdatedAt} initialNames={data.names} />
}

function GuessListEditor({ initialNames }: { initialNames: string[] }) {
  const [names, setNames] = useState(initialNames)
  const [newName, setNewName] = useState('')
  const saveCandidates = useSaveMiddleNameCandidates()
  const { showToast } = useToast()

  async function persist(next: string[]) {
    setNames(next)
    try {
      await saveCandidates.mutateAsync(next)
      showToast('Middle-name guess list saved.', 'success')
    } catch {
      showToast('Could not save the guess list.', 'error')
    }
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...names]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    persist(next)
  }

  return (
    <div className={styles.guessList}>
      {names.length === 0 && <p className={styles.empty}>No candidate names configured yet.</p>}
      <ol className={styles.guessItems}>
        {names.map((name, i) => (
          <li key={name} className={styles.guessItem}>
            <span dir="auto">{name}</span>
            <div className={styles.guessActions}>
              <IconButton icon={<ArrowUp size={14} />} label={`Move ${name} up`} size="sm" disabled={i === 0} onClick={() => move(i, -1)} />
              <IconButton
                icon={<ArrowDown size={14} />}
                label={`Move ${name} down`}
                size="sm"
                disabled={i === names.length - 1}
                onClick={() => move(i, 1)}
              />
              <IconButton
                icon={<Trash2 size={14} />}
                label={`Remove ${name}`}
                size="sm"
                onClick={() => persist(names.filter((n) => n !== name))}
              />
            </div>
          </li>
        ))}
      </ol>
      <div className={styles.addRow}>
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add a candidate name"
          aria-label="New candidate name"
        />
        <Button
          type="button"
          variant="secondary"
          disabled={!newName.trim()}
          onClick={() => {
            const trimmed = newName.trim()
            if (!trimmed) return
            persist([...names, trimmed])
            setNewName('')
          }}
        >
          <Plus size={16} /> Add
        </Button>
      </div>
    </div>
  )
}
