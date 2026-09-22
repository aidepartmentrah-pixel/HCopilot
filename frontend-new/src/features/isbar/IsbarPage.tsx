import { zodResolver } from '@hookform/resolvers/zod'
import type { ColumnDef } from '@tanstack/react-table'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { patientsApi } from '@/api/patients'
import { DataTable } from '@/components/tables/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useToast } from '@/components/feedback/useToast'
import { PageHeader } from '@/components/layout/PageHeader'
import { useCreatePatient, useModifyPatient, useNextIds, usePatients } from '@/hooks/usePatients'
import type { DirectoryPatient } from '@/types/directory'
import type { ErRosterItem } from '@/types/er'
import type { Patient } from '@/types/patient'
import { ACUITY_TONE } from './constants'
import { FallbackEntryDrawer } from './components/FallbackEntryDrawer'
import { IsbarWorkspace } from './components/IsbarWorkspace'
import { LiveErRoster } from './components/LiveErRoster'
import { emptyDraftValues, formValuesToCreateInput, formValuesToModifyInput, patientDetailsToFormValues } from './mapping'
import { isbarFormSchema, type IsbarFormValues } from './schema'
import { mapExternalGender } from './utils'
import styles from './IsbarPage.module.css'

type PanelMode = 'disabled' | 'draft' | 'active'

export function IsbarPage() {
  const [mode, setMode] = useState<PanelMode>('disabled')
  const [activeStayId, setActiveStayId] = useState<number | null>(null)
  const [fallbackOpen, setFallbackOpen] = useState(false)

  const { data: patientsData, isLoading: patientsLoading, error: patientsError, refetch: refetchPatients } = usePatients()
  const { data: nextIds } = useNextIds()
  const createPatient = useCreatePatient()
  const modifyPatient = useModifyPatient()
  const { showToast } = useToast()

  const methods = useForm<IsbarFormValues>({
    resolver: zodResolver(isbarFormSchema),
    defaultValues: nextIds ? emptyDraftValues(nextIds) : undefined,
  })

  const activePatients = patientsData?.patients ?? []

  function startDraft(seed: Partial<IsbarFormValues>) {
    if (!nextIds) return
    methods.reset({ ...emptyDraftValues(nextIds), ...seed })
    setActiveStayId(null)
    setMode('draft')
    setFallbackOpen(false)
  }

  async function loadActive(stayId: number) {
    const details = await patientsApi.details(stayId)
    methods.reset(patientDetailsToFormValues(details))
    setActiveStayId(stayId)
    setMode('active')
  }

  async function handleSelectRosterItem(item: ErRosterItem, existingStayId: number | null) {
    if (existingStayId != null) {
      await loadActive(existingStayId)
      return
    }
    if (!nextIds) return
    const name = [item.first_name, item.father_name, item.last_name].filter(Boolean).join(' ') || 'Unknown'
    try {
      await createPatient.mutateAsync({
        patient_id: nextIds.next_patient_id,
        stay_id: nextIds.next_stay_id,
        name,
        arrival_time: item.arrival_time ? item.arrival_time.slice(0, 16) : new Date().toISOString().slice(0, 16),
        er_visit_id: String(item.er_visit_id),
        record_source: 'external',
        gender: mapExternalGender(item.gender) || undefined,
        age: item.age ?? undefined,
        chiefcomplaint: item.chief_complaint ?? undefined,
      })
      await loadActive(nextIds.next_stay_id)
      showToast(`${name} added from the ER roster — continue with ISBAR below.`, 'success')
    } catch {
      showToast('Could not add this patient from the roster. Please try again.', 'error')
    }
  }

  function handleSelectDirectoryPatient(item: DirectoryPatient) {
    startDraft({
      name: item.full_name || [item.first_name, item.last_name].filter(Boolean).join(' '),
      age: item.age ?? undefined,
      gender: mapExternalGender(item.sex),
      external_patient_id: item.patient_id,
      record_source: 'external',
    })
  }

  function handleEnterManually() {
    startDraft({ record_source: 'local' })
  }

  function handleChangePatient() {
    setMode('disabled')
    setActiveStayId(null)
  }

  async function handleSubmit(values: IsbarFormValues) {
    try {
      if (mode === 'draft') {
        await createPatient.mutateAsync(formValuesToCreateInput(values))
        setActiveStayId(values.stay_id)
        setMode('active')
        showToast('Patient added — ISBAR entry started.', 'success')
      } else if (mode === 'active' && activeStayId != null) {
        await modifyPatient.mutateAsync({ stayId: activeStayId, body: formValuesToModifyInput(values) })
        showToast('Changes saved.', 'success')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save. Please check the form and try again.'
      showToast(message, 'error')
    }
  }

  // Keep the draft form's auto-filled IDs current once next-ids resolves,
  // without clobbering a user who's already mid-edit in disabled mode.
  useEffect(() => {
    if (mode === 'disabled' && nextIds) {
      methods.reset(emptyDraftValues(nextIds))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextIds])

  const columns: ColumnDef<Patient, unknown>[] = [
    { accessorKey: 'name', header: 'Patient', cell: ({ getValue }) => <span dir="auto">{getValue<string>()}</span> },
    { accessorKey: 'arrival_time', header: 'Arrival' },
    { accessorKey: 'chiefcomplaint', header: 'Chief Complaint' },
    {
      accessorKey: 'acuity',
      header: 'Acuity',
      cell: ({ getValue }) => {
        const acuity = getValue<number | null>()
        return acuity != null ? <StatusBadge label={`ESI ${acuity}`} tone={ACUITY_TONE[acuity] ?? 'neutral'} /> : '—'
      },
    },
  ]

  return (
    <>
      <PageHeader title="ER ISBAR Entry" subtitle="Create and manage structured handovers" />

      <div className={styles.layout}>
        <LiveErRoster
          activePatients={activePatients}
          activeStayId={activeStayId}
          onSelect={handleSelectRosterItem}
          onOpenFallback={() => setFallbackOpen(true)}
        />
        <IsbarWorkspace
          mode={mode}
          methods={methods}
          onSubmit={handleSubmit}
          onChangePatient={handleChangePatient}
          isSaving={createPatient.isPending || modifyPatient.isPending}
        />
      </div>

      <div className={styles.tableSection}>
        <h2 className={styles.tableTitle}>Active Patients</h2>
        <DataTable
          data={activePatients}
          columns={columns}
          getRowId={(p) => String(p.stay_id)}
          isLoading={patientsLoading}
          error={patientsError ? 'Could not load active patients.' : null}
          onRetry={() => refetchPatients()}
          emptyTitle="No active patients"
          emptyDescription="Patients picked from the roster or added manually will appear here."
          onRowClick={(p) => loadActive(p.stay_id)}
          selectedRowId={activeStayId != null ? String(activeStayId) : null}
          defaultSort={[{ id: 'arrival_time', desc: true }]}
        />
      </div>

      <FallbackEntryDrawer
        open={fallbackOpen}
        onClose={() => setFallbackOpen(false)}
        onSelectDirectoryPatient={handleSelectDirectoryPatient}
        onEnterManually={handleEnterManually}
      />
    </>
  )
}
