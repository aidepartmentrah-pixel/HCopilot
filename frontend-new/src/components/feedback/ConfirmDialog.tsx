import { useEffect, useRef } from 'react'
import { Button } from '../ui/Button'
import styles from './ConfirmDialog.module.css'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  /** Destructive actions get the destructive button treatment (§13). */
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Built on the native <dialog> element: free focus trap, Escape-to-close,
 * and backdrop, without pulling in a modal library (§3 — avoid unnecessary
 * dependencies).
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      onCancel={(e) => {
        e.preventDefault()
        onCancel()
      }}
      onClose={onCancel}
      aria-labelledby="confirm-dialog-title"
    >
      <h2 id="confirm-dialog-title" className={styles.title}>
        {title}
      </h2>
      <p className={styles.description}>{description}</p>
      <div className={styles.actions}>
        <Button variant="secondary" size="sm" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={destructive ? 'destructive' : 'primary'} size="sm" onClick={onConfirm} autoFocus>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  )
}
