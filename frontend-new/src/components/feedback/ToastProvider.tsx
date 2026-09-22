import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ToastContext, type ToastTone } from './toastContext'
import styles from './Toast.module.css'

interface Toast {
  id: number
  message: string
  tone: ToastTone
}

const TONE_ICON: Record<ToastTone, ReactNode> = {
  success: <CheckCircle2 size={18} />,
  error: <AlertCircle size={18} />,
  info: <Info size={18} />,
}

const AUTO_DISMISS_MS = 5000

/**
 * Replaces browser alert()/confirm() for notifications (§31). Mount once
 * near the app root; call useToast() (see useToast.ts) anywhere below it.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = Date.now() + Math.random()
      setToasts((current) => [...current, { id, message, tone }])
      window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
    },
    [dismiss],
  )

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.viewport} role="region" aria-label="Notifications">
        {toasts.map((toast) => (
          <div key={toast.id} className={[styles.toast, styles[toast.tone]].join(' ')} role="status">
            <span className={styles.icon} aria-hidden="true">
              {TONE_ICON[toast.tone]}
            </span>
            <span className={styles.message}>{toast.message}</span>
            <button
              type="button"
              className={styles.dismiss}
              aria-label="Dismiss notification"
              onClick={() => dismiss(toast.id)}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
