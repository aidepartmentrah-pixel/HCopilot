import { Eye, Trash2 } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { ResizablePanel } from '@/components/layout/ResizablePanel'
import { DataTable } from '@/components/tables/DataTable'
import { IconButton } from '@/components/ui/IconButton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { useToast } from '@/components/feedback/useToast'
import { useDeleteHistoryRecord, useHistory } from '@/hooks/useHistory'
import { ACUITY_TONE } from '@/features/isbar/constants'
import { formatClinicalDate } from '@/utils/dateFormat'
import type { LogPatient } from '@/types/history'
import { HistoryFiltersBar } from './components/HistoryFiltersBar'
import { RecordPreview } from './components/RecordPreview'
import { collectBedOptions, emptyHistoryFilters, filterHistory, type HistoryFilters } from './utils'
import styles from './HistoryPage.module.css'

export function HistoryPage() {
  const { data, isLoading, error, refetch } = useHistory()
  const [filters, setFilters] = useState<HistoryFilters>(emptyHistoryFilters)
  const [selectedStayId, setSelectedStayId] = useState<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<LogPatient | null>(null)
  const { showToast } = useToast()
  const deleteRecord = useDeleteHistoryRecord()

  const patients = useMemo(() => data?.patients ?? [], [data])
  const filtered = useMemo(() => filterHistory(patients, filters), [patients, filters])
  const bedOptions = useMemo(() => collectBedOptions(patients), [patients])

  async function confirmDelete() {
    if (!pendingDelete) return
    try {
      await deleteRecord.mutateAsync(pendingDelete.stay_id)
      if (selectedStayId === pendingDelete.stay_id) setSelectedStayId(null)
      showToast('Historical record deleted.', 'success')
    } catch {
      showToast('Could not delete this record.', 'error')
    } finally {
      setPendingDelete(null)
    }
  }

  const columns: ColumnDef<LogPatient, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Patient',
      // Real data has null names on ~90% of this dataset's older legacy
      // rows (pre-dates the name field being required) — an empty cell
      // reads as a rendering bug, not a real "no name recorded" state.
      cell: ({ getValue, row }) => {
        const name = getValue<string | null>()
        return name ? <span dir="auto">{name}</span> : <span title="No name recorded">Patient #{row.original.subject_id}</span>
      },
    },
    { accessorKey: 'stay_id', header: 'Stay ID' },
    { accessorKey: 'arrival_time', header: 'Arrival', cell: ({ getValue }) => formatClinicalDate(getValue<string | null>()) },
    { accessorKey: 'departure_time', header: 'Departure', cell: ({ getValue }) => formatClinicalDate(getValue<string | null>()) },
    { accessorKey: 'bed_history', header: 'Bed', cell: ({ getValue }) => getValue<string | null>() || '—' },
    {
      accessorKey: 'acuity',
      header: 'Acuity',
      cell: ({ getValue }) => {
        const acuity = getValue<number | null>()
        return acuity != null ? <StatusBadge label={`ESI ${acuity}`} tone={ACUITY_TONE[acuity] ?? 'neutral'} /> : '—'
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      cell: ({ row }) => (
        <div className={styles.actions}>
          <IconButton
            icon={<Eye size={16} />}
            label={`View ${row.original.name || `Patient #${row.original.subject_id}`}`}
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              setSelectedStayId(row.original.stay_id)
            }}
          />
          <IconButton
            icon={<Trash2 size={16} />}
            label={`Delete stay #${row.original.stay_id}`}
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              setPendingDelete(row.original)
            }}
          />
        </div>
      ),
    },
  ]

  return (
    <div className={styles.page}>
      <PageHeader title="History" subtitle="Search and review previous ER stays" />
      <div className={styles.filters}>
        <HistoryFiltersBar filters={filters} onChange={setFilters} bedOptions={bedOptions} />
        <span className={styles.recordCount}>{filtered.length} records</span>
      </div>
      <div className={styles.splitArea}>
        <ResizablePanel
          storageKey="history-preview-width"
          left={
            <DataTable
              data={filtered}
              columns={columns}
              getRowId={(p) => String(p.stay_id)}
              isLoading={isLoading}
              error={error ? 'Could not load History.' : null}
              onRetry={() => refetch()}
              emptyTitle="No matching stays"
              emptyDescription="Try adjusting search or filters."
              onRowClick={(p) => setSelectedStayId(p.stay_id)}
              selectedRowId={selectedStayId != null ? String(selectedStayId) : null}
            />
          }
          right={selectedStayId != null ? <RecordPreview stayId={selectedStayId} onClose={() => setSelectedStayId(null)} /> : null}
        />
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete historical stay?"
        description={
          pendingDelete
            ? `${pendingDelete.name || `Patient #${pendingDelete.subject_id}`} · Patient #${pendingDelete.subject_id} · Stay #${pendingDelete.stay_id} · ${formatClinicalDate(pendingDelete.arrival_time)}. This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete Record"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
