import type { ColumnDef } from '@tanstack/react-table'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { DataTable } from '@/components/tables/DataTable'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { useToast } from '@/components/feedback/useToast'
import { useCreateWard, useDeleteWard, useModifyWard, useWards } from '@/hooks/useSettings'
import type { Ward } from '@/types/ward'
import { ResourceFormDialog, type ResourceField } from './ResourceFormDialog'
import styles from './ResourceSettings.module.css'

const FIELDS: ResourceField[] = [
  { name: 'ward_name', label: 'Ward Name', type: 'text', required: true },
  { name: 'department_id', label: 'Department ID', type: 'number', required: true },
]

export function WardsSettings() {
  const { data, isLoading, error, refetch } = useWards()
  const createWard = useCreateWard()
  const modifyWard = useModifyWard()
  const deleteWard = useDeleteWard()
  const { showToast } = useToast()

  const [editing, setEditing] = useState<Ward | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Ward | null>(null)

  const columns: ColumnDef<Ward, unknown>[] = [
    { accessorKey: 'ward_id', header: 'ID' },
    { accessorKey: 'ward_name', header: 'Ward Name' },
    { accessorKey: 'department_id', header: 'Department' },
    { accessorKey: 'assigned_beds', header: 'Assigned Beds' },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <IconButton
          icon={<Trash2 size={16} />}
          label={`Delete ${row.original.ward_name}`}
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
        <h2 className={styles.title}>Wards</h2>
        <Button onClick={() => setEditing('new')}>
          <Plus size={16} /> Add Ward
        </Button>
      </div>

      <DataTable
        data={data?.wards ?? []}
        columns={columns}
        getRowId={(w) => String(w.ward_id)}
        isLoading={isLoading}
        error={error ? 'Could not load wards.' : null}
        onRetry={() => refetch()}
        onRowClick={(w) => setEditing(w)}
        emptyTitle="No wards configured"
        defaultSort={[{ id: 'ward_id', desc: true }]}
      />

      <ResourceFormDialog
        open={editing !== null}
        title={editing === 'new' ? 'Add Ward' : 'Edit Ward'}
        fields={FIELDS}
        initialValues={
          editing && editing !== 'new'
            ? { ward_name: editing.ward_name, department_id: String(editing.department_id) }
            : { ward_name: '', department_id: '' }
        }
        onSubmit={async (values) => {
          const body = { ward_name: values.ward_name, department_id: Number(values.department_id) }
          if (editing === 'new') {
            await createWard.mutateAsync(body)
            showToast('Ward added.', 'success')
          } else if (editing) {
            await modifyWard.mutateAsync({ id: editing.ward_id, body })
            showToast('Ward updated.', 'success')
          }
        }}
        onClose={() => setEditing(null)}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.ward_name}?`}
        description="This removes the ward and its bed assignments. This cannot be undone."
        destructive
        confirmLabel="Delete Ward"
        onConfirm={async () => {
          if (!deleting) return
          try {
            await deleteWard.mutateAsync(deleting.ward_id)
            showToast('Ward deleted.', 'success')
          } catch {
            showToast('Could not delete this ward.', 'error')
          } finally {
            setDeleting(null)
          }
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
