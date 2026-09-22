import type { ColumnDef } from '@tanstack/react-table'
import { Plus, Trash2, UserX } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Badge } from '@/components/ui/Badge'
import { DataTable } from '@/components/tables/DataTable'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { useToast } from '@/components/feedback/useToast'
import { settingsKeys, useCreateDoctor, useDeleteDoctor, useDoctors, useModifyDoctor } from '@/hooks/useSettings'
import { staffApi } from '@/api/settings'
import { useQueryClient } from '@tanstack/react-query'
import { DOCTOR_TYPES, type Doctor, type DoctorInput } from '@/types/staff'
import { ResourceFormDialog, type ResourceField } from './ResourceFormDialog'
import styles from './ResourceSettings.module.css'

const FIELDS: ResourceField[] = [
  { name: 'name', label: 'Name', type: 'text' },
  { name: 'intern_or_not', label: 'Type', type: 'select', options: DOCTOR_TYPES, required: true },
  { name: 'shift', label: 'Shift', type: 'text', required: true },
  { name: 'work_days', label: 'Work Days Group', type: 'text', required: true },
]

export function DoctorsSettings() {
  const { data, isLoading, error, refetch } = useDoctors()
  const createDoctor = useCreateDoctor()
  const modifyDoctor = useModifyDoctor()
  const deleteDoctor = useDeleteDoctor()
  const { showToast } = useToast()
  const queryClient = useQueryClient()

  const [editing, setEditing] = useState<Doctor | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Doctor | null>(null)

  const columns: ColumnDef<Doctor, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ getValue }) => <span dir="auto">{getValue<string | null>() || '—'}</span>,
    },
    { accessorKey: 'intern_or_not', header: 'Type' },
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
              await staffApi.doctors.toggleAbsent(row.original.id)
              queryClient.invalidateQueries({ queryKey: settingsKeys.doctors })
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
        <h2 className={styles.title}>Doctors</h2>
        <Button onClick={() => setEditing('new')}>
          <Plus size={16} /> Add Doctor
        </Button>
      </div>

      <DataTable
        data={data?.doctors ?? []}
        columns={columns}
        getRowId={(d) => String(d.id)}
        isLoading={isLoading}
        error={error ? 'Could not load doctors.' : null}
        onRetry={() => refetch()}
        onRowClick={(d) => setEditing(d)}
        emptyTitle="No doctors configured"
      />

      <ResourceFormDialog
        open={editing !== null}
        title={editing === 'new' ? 'Add Doctor' : 'Edit Doctor'}
        fields={FIELDS}
        initialValues={
          editing && editing !== 'new'
            ? {
                name: editing.name ?? '',
                intern_or_not: editing.intern_or_not,
                shift: editing.shift,
                work_days: editing.work_days ?? '',
              }
            : { name: '', intern_or_not: '', shift: '', work_days: '' }
        }
        onSubmit={async (values) => {
          // The generic dialog only knows Record<string, string>; the
          // `required` fields above guarantee intern_or_not/shift/work_days
          // are non-empty by the time onSubmit fires.
          const body = values as unknown as DoctorInput
          if (editing === 'new') {
            await createDoctor.mutateAsync(body)
            showToast('Doctor added.', 'success')
          } else if (editing) {
            await modifyDoctor.mutateAsync({ id: editing.id, body })
            showToast('Doctor updated.', 'success')
          }
        }}
        onClose={() => setEditing(null)}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name || 'this doctor'}?`}
        description="This cannot be undone."
        destructive
        confirmLabel="Delete Doctor"
        onConfirm={async () => {
          if (!deleting) return
          try {
            await deleteDoctor.mutateAsync(deleting.id)
            showToast('Doctor deleted.', 'success')
          } catch {
            showToast('Could not delete this doctor.', 'error')
          } finally {
            setDeleting(null)
          }
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
