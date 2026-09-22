import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { IconButton } from '../ui/IconButton'
import styles from './Drawer.module.css'

interface DrawerProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  width?: number
}

/** Slide-in panel for preview/contextual content (§32) — not for entire large clinical records. */
export function Drawer({ open, title, onClose, children, width = 420 }: DrawerProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div
        className={styles.drawer}
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
      >
        <div className={styles.header}>
          <h2 id="drawer-title" className={styles.title}>
            {title}
          </h2>
          <IconButton icon={<X size={18} />} label="Close" onClick={onClose} />
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </>
  )
}
