import { useState } from 'react'
import { Search } from 'lucide-react'
import { Drawer } from '@/components/layout/Drawer'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/forms/Input'
import { FormField } from '@/components/forms/FormField'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { directoryApi } from '@/api/directory'
import type { DirectoryPatient } from '@/types/directory'
import styles from './FallbackEntryDrawer.module.css'

interface FallbackEntryDrawerProps {
  open: boolean
  onClose: () => void
  onSelectDirectoryPatient: (patient: DirectoryPatient) => void
  onEnterManually: () => void
}

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'results'; items: DirectoryPatient[] }

export function FallbackEntryDrawer({ open, onClose, onSelectDirectoryPatient, onEnterManually }: FallbackEntryDrawerProps) {
  const [patientId, setPatientId] = useState('')
  const [firstName, setFirstName] = useState('')
  const [fatherName, setFatherName] = useState('')
  const [lastName, setLastName] = useState('')
  const [state, setState] = useState<SearchState>({ status: 'idle' })

  const canSearchByNames = firstName.trim() && fatherName.trim() && lastName.trim()
  const canSearch = patientId.trim() || canSearchByNames

  async function handleSearch() {
    setState({ status: 'loading' })
    try {
      const result = await directoryApi.search(
        patientId.trim()
          ? { patientId: patientId.trim() }
          : { firstName: firstName.trim(), fatherName: fatherName.trim(), lastName: lastName.trim() },
      )
      if (result.status !== 'ok') {
        setState({ status: 'error', message: result.message || 'Hospital Directory search failed.' })
        return
      }
      setState({ status: 'results', items: result.items })
    } catch {
      setState({ status: 'error', message: 'Hospital Directory is unreachable right now.' })
    }
  }

  return (
    <Drawer open={open} title="Find or Add a Patient" onClose={onClose} width={440}>
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Search Hospital Directory</h3>
        <FormField label="Patient ID" htmlFor="dir-patient-id">
          <Input id="dir-patient-id" value={patientId} onChange={(e) => setPatientId(e.target.value)} placeholder="e.g. 10234567" />
        </FormField>
        <p className={styles.or}>— or search by full name —</p>
        <div className={styles.nameRow}>
          <FormField label="First Name" htmlFor="dir-first-name">
            <Input id="dir-first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </FormField>
          <FormField label="Father Name" htmlFor="dir-father-name">
            <Input id="dir-father-name" value={fatherName} onChange={(e) => setFatherName(e.target.value)} />
          </FormField>
          <FormField label="Last Name" htmlFor="dir-last-name">
            <Input id="dir-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </FormField>
        </div>
        <Button size="sm" onClick={handleSearch} disabled={!canSearch} loading={state.status === 'loading'}>
          <Search size={16} /> Search
        </Button>
      </div>

      <div className={styles.results}>
        {state.status === 'error' && <ErrorState description={state.message} onRetry={handleSearch} />}
        {state.status === 'loading' && <LoadingState label="Searching Hospital Directory…" />}
        {state.status === 'results' && state.items.length === 0 && (
          <EmptyState title="No matches" description="Try Enter Manually below instead." />
        )}
        {state.status === 'results' &&
          state.items.map((item) => (
            <button key={item.patient_id} type="button" className={styles.resultRow} onClick={() => onSelectDirectoryPatient(item)}>
              <span dir="auto">{item.full_name || [item.first_name, item.last_name].filter(Boolean).join(' ') || 'Unnamed'}</span>
              <span className={styles.resultMeta}>
                {[item.age != null ? `${item.age}y` : null, item.sex].filter(Boolean).join(' · ')}
              </span>
            </button>
          ))}
      </div>

      <div className={styles.manualSection}>
        <p className={styles.or}>— or —</p>
        <Button variant="secondary" onClick={onEnterManually}>
          Enter Manually
        </Button>
      </div>
    </Drawer>
  )
}
