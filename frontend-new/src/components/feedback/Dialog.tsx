import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './Dialog.module.css'

interface DialogProps {
  open: boolean
  /** Called when the user presses Escape. (A backdrop click deliberately does nothing — same as the native <dialog>.) */
  onClose: () => void
  /** Styling for the panel itself (width, padding, radius…). */
  className?: string
  'aria-labelledby'?: string
  children: ReactNode
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function isShown(el: HTMLElement): boolean {
  if (el.hidden) return false
  const style = getComputedStyle(el)
  return style.display !== 'none' && style.visibility !== 'hidden'
}

/** Open dialogs, topmost last — Escape closes only the topmost, and page scrolling is locked while any is open. */
const openStack: symbol[] = []
/** The page's own overflow value, saved when the FIRST dialog opens and restored when the LAST one closes. */
let savedBodyOverflow = ''

/**
 * The app's one modal. It replaces the browser's native <dialog>, which Firefox only supports from
 * version 98 (the hospital PCs run 97) — and behaves the same on every browser: dark backdrop, focus moves
 * inside and cannot Tab out, Escape closes, the page behind cannot scroll, focus returns to where it was.
 */
export function Dialog({ open, onClose, className, children, 'aria-labelledby': labelledBy }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const id = Symbol('dialog')
    openStack.push(id)
    const previouslyFocused = document.activeElement as HTMLElement | null
    if (openStack.length === 1) savedBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Like the native dialog: keep an element that already took focus (autoFocus), else the first control, else the panel.
    const panel = panelRef.current
    if (panel && !panel.contains(document.activeElement)) {
      ;(panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel).focus()
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (openStack[openStack.length - 1] !== id) return
      if (e.key === 'Escape') {
        // A date-picker calendar handles its own Escape first.
        if (e.defaultPrevented || document.querySelector('.flatpickr-calendar.open')) return
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key === 'Tab' && panelRef.current) {
        const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isShown)
        if (items.length === 0) {
          e.preventDefault()
          return
        }
        const first = items[0]
        const last = items[items.length - 1]
        const active = document.activeElement
        if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && (active === last || !panelRef.current.contains(active))) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      const index = openStack.indexOf(id)
      if (index >= 0) openStack.splice(index, 1)
      if (openStack.length === 0) document.body.style.overflow = savedBodyOverflow
      previouslyFocused?.focus?.()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div className={styles.overlay}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} className={[styles.panel, className].filter(Boolean).join(' ')}>
        {children}
      </div>
    </div>,
    document.body,
  )
}
