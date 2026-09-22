import type { ColumnDef } from '@tanstack/react-table'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DataTable } from '@/components/tables/DataTable'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { useToast } from '@/components/feedback/useToast'
import { useBeds, useCreateBed, useDeleteBed, useModifyBed } from '@/hooks/useBeds'
import { useWards } from '@/hooks/useSettings'
import type { Bed } from '@/types/bed'
import { ResourceFormDialog, type ResourceField } from './ResourceFormDialog'
import styles from './ResourceSettings.module.css'

const BED_TYPES = ['normal', 'monitor', 'ICU', 'chariot'] as const

export function BedsSettings() {
  const { data, isLoading, error, refetch } = useBeds()
  const { data: wardsData } = useWards()
  const createBed = useCreateBed()
  const modifyBed = useModifyBed()
  const deleteBed = useDeleteBed()
  const { showToast } = useToast()

  const [editing, setEditing] = useState<Bed | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Bed | null>(null)

  const wardOptions = (wardsData?.wards ?? []).map((w) => w.ward_name)
  const wardIdByName = new Map((wardsData?.wards ?? []).map((w) => [w.ward_name, w.ward_id]))

  const fields: ResourceField[] = [
    { name: 'bed_number', label: 'Bed Number', type: 'text', required: true },
    { name: 'ward_name', label: 'Ward', type: 'select', options: wardOptions },
    { name: 'bed_type', label: 'Bed Type', type: 'select', options: BED_TYPES },
  ]

  const columns: ColumnDef<Bed, unknown>[] = [
    { accessorKey: 'bed_number', header: 'Bed Number' },
    {
      accessorKey: 'bed_status',
      header: 'Status',
      cell: ({ getValue }) => {
        const status = getValue<string>()
        return <StatusBadge label={status} tone={status === 'Available' ? 'success' : status === 'Occupied' ? 'occupied' : 'warning'} />
      },
    },
    { accessorKey: 'bed_type', header: 'Type' },
    { accessorKey: 'ward_name', header: 'Ward', cell: ({ getValue }) => getValue<string | null>() || '—' },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <IconButton
          icon={<Trash2 size={16} />}
          label={`Delete Bed ${row.original.bed_number}`}
          onClick={(e) => {
            e.stopPropagation()
            setDeleting(row.original)
          }}
        />
      ),
    },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <h2 className={styles.title}>Beds</h2>
        <Button onClick={() => setEditing('new')}>
          <Plus size={16} /> Add Bed
        </Button>
      </div>

      <DataTable
        data={data?.beds ?? []}
        columns={columns}
        getRowId={(b) => String(b.bed_id)}
        isLoading={isLoading}
        error={error ? 'Could not load beds.' : null}
        onRetry={() => refetch()}
        onRowClick={(b) => setEditing(b)}
        emptyTitle="No beds configured"
      />

      <ResourceFormDialog
        open={editing !== null}
        title={editing === 'new' ? 'Add Bed' : 'Edit Bed'}
        fields={fields}
        initialValues={
          editing && editing !== 'new'
            ? { bed_number: editing.bed_number, ward_name: editing.ward_name ?? '', bed_type: editing.bed_type }
            : { bed_number: '', ward_name: '', bed_type: 'normal' }
        }
        onSubmit={async (values) => {
          const body = {
            bed_number: values.bed_number,
            ward_id: values.ward_name ? wardIdByName.get(values.ward_name) : undefined,
            bed_type: values.bed_type || undefined,
          }
          if (editing === 'new') {
            await createBed.mutateAsync(body)
            showToast('Bed added.', 'success')
          } else if (editing) {
            await modifyBed.mutateAsync({ bedId: editing.bed_id, body })
            showToast('Bed updated.', 'success')
          }
        }}
        onClose={() => setEditing(null)}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete Bed ${deleting?.bed_number}?`}
        description="This cannot be undone. A bed with an assigned patient can't be deleted."
        destructive
        confirmLabel="Delete Bed"
        onConfirm={async () => {
          if (!deleting) return
          try {
            await deleteBed.mutateAsync(deleting.bed_id)
            showToast('Bed deleted.', 'success')
          } catch {
            showToast('Could not delete this bed.', 'error')
          } finally {
            setDeleting(null)
          }
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
