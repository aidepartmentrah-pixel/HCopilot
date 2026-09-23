import type { ColumnDef } from '@tanstack/react-table'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DataTable } from '@/components/tables/DataTable'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { useToast } from '@/components/feedback/useToast'
import { useAuth } from '@/app/providers/useAuth'
import { useAccounts, useCreateAccount, useDeleteAccount, useModifyAccount } from '@/hooks/useAccounts'
import type { UserAccount, UserAccountInput } from '@/types/settings'
import { initialsOf } from '@/utils/initials'
import { AccountFormDialog } from './AccountFormDialog'
import styles from './AccountsSettings.module.css'

/** Restores Accounts & Permissions (§29–§35) — real CRUD against the existing, previously-unbuilt auth/users backend. */
export function AccountsSettings() {
  const { data, isLoading, error, refetch } = useAccounts()
  const createAccount = useCreateAccount()
  const modifyAccount = useModifyAccount()
  const deleteAccount = useDeleteAccount()
  const { showToast } = useToast()
  const { user: currentUser } = useAuth()

  const [editing, setEditing] = useState<UserAccount | 'new' | null>(null)
  const [deleting, setDeleting] = useState<UserAccount | null>(null)

  const adminCount = (data?.users ?? []).filter((u) => u.role === 'admin').length

  const columns: ColumnDef<UserAccount, unknown>[] = [
    {
      accessorKey: 'username',
      header: 'User',
      cell: ({ row }) => {
        const u = row.original
        const displayName = u.name?.trim() || u.username
        return (
          <div className={styles.userCell}>
            <span className={styles.avatar} aria-hidden="true">
              {initialsOf(displayName)}
            </span>
            <span>
              <span className={styles.name} dir="auto">
                {displayName}
              </span>
              <span className={styles.username}>@{u.username}</span>
            </span>
          </div>
        )
      },
    },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ getValue }) => {
        const role = getValue<string>()
        return <StatusBadge label={role.toUpperCase()} tone={role === 'admin' ? 'brand' : 'neutral'} />
      },
    },
    {
      id: 'access',
      header: 'Access',
      cell: ({ row }) =>
        row.original.role === 'admin' ? 'Full access' : `${row.original.sections.split(',').filter(Boolean).length} section(s)`,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const u = row.original
        const isLastAdmin = u.role === 'admin' && adminCount <= 1
        const isSelf = currentUser?.user_id === u.user_id
        return (
          <div className={styles.actionsCell}>
            <IconButton
              icon={<Trash2 size={16} />}
              label={`Delete ${u.username}`}
              disabled={isLastAdmin || isSelf}
              onClick={(e) => {
                e.stopPropagation()
                setDeleting(u)
              }}
            />
          </div>
        )
      },
    },
  ]

  async function handleSubmit(body: UserAccountInput) {
    if (editing === 'new') {
      await createAccount.mutateAsync(body)
      showToast('User added.', 'success')
    } else if (editing) {
      await modifyAccount.mutateAsync({ userId: editing.user_id, body })
      showToast('User updated.', 'success')
    }
  }

  async function handleDelete() {
    if (!deleting) return
    try {
      await deleteAccount.mutateAsync(deleting.user_id)
      showToast('Account deleted.', 'success')
    } catch {
      showToast('Could not delete this account.', 'error')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <h2 className={styles.title}>Accounts & Permissions</h2>
        <Button onClick={() => setEditing('new')}>
          <Plus size={16} /> Add User
        </Button>
      </div>

      <DataTable
        data={data?.users ?? []}
        columns={columns}
        getRowId={(u) => String(u.user_id)}
        isLoading={isLoading}
        error={error ? 'Could not load accounts.' : null}
        onRetry={() => refetch()}
        onRowClick={(u) => setEditing(u)}
        emptyTitle="No accounts found"
      />

      <AccountFormDialog open={editing !== null} account={editing} onSubmit={handleSubmit} onClose={() => setEditing(null)} />

      <ConfirmDialog
        open={deleting !== null}
        title="Delete account?"
        description={
          deleting
            ? `${deleting.name?.trim() || deleting.username} · @${deleting.username}. This account will no longer be able to access HCopilot.`
            : ''
        }
        destructive
        confirmLabel="Delete Account"
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
