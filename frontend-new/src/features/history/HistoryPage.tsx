import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { ResizablePanel } from '@/components/layout/ResizablePanel'
import { DataTable } from '@/components/tables/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useHistory } from '@/hooks/useHistory'
import { ACUITY_TONE } from '@/features/isbar/constants'
import type { LogPatient } from '@/types/history'
import { HistoryFiltersBar } from './components/HistoryFiltersBar'
import { RecordPreview } from './components/RecordPreview'
import { collectBedOptions, emptyHistoryFilters, filterHistory, type HistoryFilters } from './utils'
import styles from './HistoryPage.module.css'

export function HistoryPage() {
  const { data, isLoading, error, refetch } = useHistory()
  const [filters, setFilters] = useState<HistoryFilters>(emptyHistoryFilters)
  const [selectedStayId, setSelectedStayId] = useState<number | null>(null)

  const patients = useMemo(() => data?.patients ?? [], [data])
  const filtered = useMemo(() => filterHistory(patients, filters), [patients, filters])
  const bedOptions = useMemo(() => collectBedOptions(patients), [patients])

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
    { accessorKey: 'arrival_time', header: 'Arrival' },
    { accessorKey: 'departure_time', header: 'Departure' },
    { accessorKey: 'bed_history', header: 'Bed', cell: ({ getValue }) => getValue<string | null>() || '—' },
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
    <div className={styles.page}>
      <PageHeader title="History" subtitle="Search and review previous ER stays" />
      <div className={styles.filters}>
        <HistoryFiltersBar filters={filters} onChange={setFilters} bedOptions={bedOptions} />
      </div>
      <div className={styles.splitArea}>
        <ResizablePanel
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
    </div>
  )
}
