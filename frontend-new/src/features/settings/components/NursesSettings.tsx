import type { ColumnDef } from '@tanstack/react-table'
import { Plus, Trash2, UserX } from 'lucide-react'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Badge } from '@/components/ui/Badge'
import { DataTable } from '@/components/tables/DataTable'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { useToast } from '@/components/feedback/useToast'
import { staffApi } from '@/api/settings'
import { settingsKeys, useCreateNurse, useDeleteNurse, useModifyNurse, useNurses } from '@/hooks/useSettings'
import { NURSE_ROLES, type Nurse, type NurseInput } from '@/types/staff'
import { ResourceFormDialog, type ResourceField } from './ResourceFormDialog'
import styles from './ResourceSettings.module.css'

const FIELDS: ResourceField[] = [
  { name: 'name', label: 'Name', type: 'text' },
  { name: 'role', label: 'Role', type: 'select', options: NURSE_ROLES, required: true },
  { name: 'shift', label: 'Shift', type: 'text', required: true },
  { name: 'group', label: 'Group', type: 'text', required: true },
]

export function NursesSettings() {
  const { data, isLoading, error, refetch } = useNurses()
  const createNurse = useCreateNurse()
  const modifyNurse = useModifyNurse()
  const deleteNurse = useDeleteNurse()
  const { showToast } = useToast()
  const queryClient = useQueryClient()

  const [editing, setEditing] = useState<Nurse | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Nurse | null>(null)

  const columns: ColumnDef<Nurse, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ getValue }) => <span dir="auto">{getValue<string | null>() || '—'}</span>,
    },
    { accessorKey: 'role', header: 'Role' },
    { accessorKey: 'shift', header: 'Shift' },
    {
      accessorKey: 'absent',
      header: 'Status',
      cell: ({ getValue }) => (getValue<boolean>() ? <Badge tone="neutral">Absent</Badge> : <Badge tone="brand">On Duty</Badge>),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className={styles.actionsCell}>
          <IconButton
            icon={<UserX size={16} />}
            label={`Toggle absent for ${row.original.name}`}
            onClick={async (e) => {
              e.stopPropagation()
              await staffApi.nurses.toggleAbsent(row.original.id)
              queryClient.invalidateQueries({ queryKey: settingsKeys.nurses })
            }}
          />
          <IconButton
            icon={<Trash2 size={16} />}
            label={`Delete ${row.original.name}`}
            onClick={(e) => {
              e.stopPropagation()
              setDeleting(row.original)
            }}
          />
        </div>
      ),
    },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <h2 className={styles.title}>Nurses</h2>
        <Button onClick={() => setEditing('new')}>
          <Plus size={16} /> Add Nurse
        </Button>
      </div>

      <DataTable
        data={data?.nurses ?? []}
        columns={columns}
        getRowId={(n) => String(n.id)}
        isLoading={isLoading}
        error={error ? 'Could not load nurses.' : null}
        onRetry={() => refetch()}
        onRowClick={(n) => setEditing(n)}
        emptyTitle="No nurses configured"
      />

      <ResourceFormDialog
        open={editing !== null}
        title={editing === 'new' ? 'Add Nurse' : 'Edit Nurse'}
        fields={FIELDS}
        initialValues={
          editing && editing !== 'new'
            ? { name: editing.name ?? '', role: editing.role, shift: editing.shift, group: editing.group ?? '' }
            : { name: '', role: '', shift: '', group: '' }
        }
        onSubmit={async (values) => {
          // The generic dialog only knows Record<string, string>; the
          // `required` fields above guarantee role/shift/group are
          // non-empty by the time onSubmit fires.
          const body = values as unknown as NurseInput
          if (editing === 'new') {
            await createNurse.mutateAsync(body)
            showToast('Nurse added.', 'success')
          } else if (editing) {
            await modifyNurse.mutateAsync({ id: editing.id, body })
            showToast('Nurse updated.', 'success')
          }
        }}
        onClose={() => setEditing(null)}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name || 'this nurse'}?`}
        description="This cannot be undone."
        destructive
        confirmLabel="Delete Nurse"
        onConfirm={async () => {
          if (!deleting) return
          try {
            await deleteNurse.mutateAsync(deleting.id)
            showToast('Nurse deleted.', 'success')
          } catch {
            showToast('Could not delete this nurse.', 'error')
          } finally {
            setDeleting(null)
          }
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
