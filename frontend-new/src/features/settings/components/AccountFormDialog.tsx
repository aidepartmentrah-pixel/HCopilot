import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/forms/FormField'
import { Input } from '@/components/forms/Input'
import { YesNoToggle } from '@/components/forms/YesNoToggle'
import type { UserAccount, UserAccountInput } from '@/types/settings'
import { grantAllKnownKeys, SECTION_PERMISSIONS, SETTINGS_TAB_PERMISSIONS } from '../permissions'
import { PermissionsEditor } from './PermissionsEditor'
import styles from './AccountFormDialog.module.css'

interface AccountFormDialogProps {
  open: boolean
  account: UserAccount | 'new' | null
  onSubmit: (body: UserAccountInput) => Promise<void>
  onClose: () => void
}

const EMPTY: UserAccountInput = { username: '', password: '', name: '', role: 'user', sections: '', settings_tabs: '', statistics_tabs: '' }

/** A dedicated form (§33) rather than forced into the generic ResourceFormDialog — accounts need password/role/permission widgets no other Settings resource does. */
export function AccountFormDialog({ open, account, onSubmit, onClose }: AccountFormDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [values, setValues] = useState<UserAccountInput>(EMPTY)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isNew = account === 'new'

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
    if (account && account !== 'new') {
      setValues({
        username: account.username,
        password: '',
        name: account.name,
        role: account.role,
        sections: account.sections,
        settings_tabs: account.settings_tabs,
        statistics_tabs: account.statistics_tabs,
      })
    } else {
      setValues(EMPTY)
    }
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, account])

  function handleRoleChange(role: 'admin' | 'user') {
    if (role === 'admin') {
      setValues((v) => ({
        ...v,
        role,
        sections: grantAllKnownKeys(v.sections, SECTION_PERMISSIONS),
        settings_tabs: grantAllKnownKeys(v.settings_tabs, SETTINGS_TAB_PERMISSIONS),
      }))
    } else {
      setValues((v) => ({ ...v, role }))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSaving(true)
    setError(null)
    try {
      const body: UserAccountInput = { ...values }
      if (!isNew && !body.password) delete body.password
      await onSubmit(body)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this account.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <dialog ref={dialogRef} className={styles.dialog} onClose={onClose} aria-labelledby="account-dialog-title">
      <form onSubmit={handleSubmit} className={styles.form}>
        <h2 id="account-dialog-title" className={styles.title}>
          {isNew ? 'Add User' : 'Edit User'}
        </h2>

        <div className={styles.row}>
          <FormField label="Username" htmlFor="acc-username" required>
            <Input
              id="acc-username"
              value={values.username}
              onChange={(e) => setValues((v) => ({ ...v, username: e.target.value }))}
              required
              dir="ltr"
              autoComplete="off"
            />
          </FormField>
          <FormField label="Display Name" htmlFor="acc-name">
            <Input id="acc-name" value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} />
          </FormField>
        </div>

        <FormField
          label="Password"
          htmlFor="acc-password"
          required={isNew}
          hint={isNew ? undefined : 'Leave blank to keep the current password'}
        >
          <Input
            id="acc-password"
            type="password"
            value={values.password}
            onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
            required={isNew}
            autoComplete="new-password"
            dir="ltr"
          />
        </FormField>

        <FormField label="Role" htmlFor="acc-role">
          <YesNoToggle
            id="acc-role"
            value={values.role}
            options={['admin', 'user']}
            labels={{ admin: 'Admin', user: 'User' }}
            onChange={(v) => handleRoleChange(v as 'admin' | 'user')}
          />
        </FormField>

        <FormField label="Access Permissions" htmlFor="acc-permissions">
          <PermissionsEditor
            sections={values.sections}
            settingsTabs={values.settings_tabs}
            isAdmin={values.role === 'admin'}
            onChange={({ sections, settingsTabs }) => setValues((v) => ({ ...v, sections, settings_tabs: settingsTabs }))}
          />
        </FormField>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={isSaving}>
            Save
          </Button>
        </div>
      </form>
    </dialog>
  )
}
