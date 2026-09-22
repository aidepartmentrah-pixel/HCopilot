import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/forms/FormField'
import { Input } from '@/components/forms/Input'
import { Select } from '@/components/forms/Select'
import styles from './ResourceFormDialog.module.css'

export interface ResourceField {
  name: string
  label: string
  type: 'text' | 'number' | 'select'
  options?: readonly string[]
  required?: boolean
}

interface ResourceFormDialogProps {
  open: boolean
  title: string
  fields: ResourceField[]
  initialValues: Record<string, string>
  onSubmit: (values: Record<string, string>) => Promise<void>
  onClose: () => void
}

/** Compact administrative create/edit (§32) — one small, consistent dialog shape reused across every Settings resource. */
export function ResourceFormDialog({ open, title, fields, initialValues, onSubmit, onClose }: ResourceFormDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [values, setValues] = useState<Record<string, string>>(initialValues)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
    setValues(initialValues)
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSaving(true)
    setError(null)
    try {
      await onSubmit(values)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Please check the form and try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <dialog ref={dialogRef} className={styles.dialog} onClose={onClose} aria-labelledby="resource-dialog-title">
      <form onSubmit={handleSubmit} className={styles.form}>
        <h2 id="resource-dialog-title" className={styles.title}>
          {title}
        </h2>
        {fields.map((field) => (
          <FormField key={field.name} label={field.label} htmlFor={`rf-${field.name}`} required={field.required}>
            {field.type === 'select' ? (
              <Select
                id={`rf-${field.name}`}
                value={values[field.name] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                required={field.required}
                placeholder="Select…"
              >
                {field.options?.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                id={`rf-${field.name}`}
                type={field.type}
                value={values[field.name] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                required={field.required}
              />
            )}
          </FormField>
        ))}
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
