import type { ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import styles from './ResizablePanel.module.css'

interface ResizablePanelProps {
  left: ReactNode
  /** null collapses the right pane entirely — `left` takes full width, but stays mounted at the same tree position (doesn't remount/lose its own state, e.g. a table's sort or scroll position — confirmed decision #11's "closing preview never disturbs table state"). */
  right: ReactNode | null
  /** Starting right-pane width in px — defaults to roughly 38% of a 1440px desktop viewport (§22's 35-40% guidance). */
  defaultRightWidth?: number
  minLeftWidth?: number
  minRightWidth?: number
  /** When set, the dragged width persists to localStorage under this key and restores on mount (History spec §9's own example key name, "history-preview-width") — a per-viewer convenience, omitted entirely for callers that don't opt in. */
  storageKey?: string
}

function readStoredWidth(key: string | undefined, fallback: number): number {
  if (!key) return fallback
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? Number(raw) : NaN
    return Number.isFinite(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

/**
 * Two-pane split with a draggable divider — plain mouse events, no
 * library, matching the pattern already proven in the old frontend's own
 * History redesign.
 */
export function ResizablePanel({
  left,
  right,
  defaultRightWidth = 480,
  minLeftWidth = 420,
  minRightWidth = 360,
  storageKey,
}: ResizablePanelProps) {
  const [rightWidth, setRightWidthState] = useState(() => readStoredWidth(storageKey, defaultRightWidth))

  const setRightWidth = useCallback(
    (update: number | ((w: number) => number)) => {
      setRightWidthState((prev) => {
        const next = typeof update === 'function' ? update(prev) : update
        if (storageKey) {
          try {
            localStorage.setItem(storageKey, String(next))
          } catch {
            // best-effort only — a private window or blocked storage just means this session doesn't persist
          }
        }
        return next
      })
    },
    [storageKey],
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  // Registered once; reads current min-widths via refs so the effect never
  // needs to re-run (and the listener pair never needs to reference itself).
  // Synced in an effect, not during render — writing a ref while rendering
  // is impure and can misbehave under StrictMode's double-invoke.
  const minLeftRef = useRef(minLeftWidth)
  const minRightRef = useRef(minRightWidth)
  useEffect(() => {
    minLeftRef.current = minLeftWidth
    minRightRef.current = minRightWidth
  }, [minLeftWidth, minRightWidth])

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!draggingRef.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const proposedRight = rect.right - e.clientX
      const maxRightWidth = rect.width - minLeftRef.current
      setRightWidth(
        Math.min(Math.max(proposedRight, minRightRef.current), Math.max(maxRightWidth, minRightRef.current)),
      )
    }

    const stopDragging = () => {
      draggingRef.current = false
      document.body.style.cursor = ''
    }

    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', stopDragging)
    return () => {
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', stopDragging)
    }
  }, [setRightWidth])

  const startDragging = (e: React.PointerEvent) => {
    e.preventDefault()
    draggingRef.current = true
    document.body.style.cursor = 'col-resize'
  }

  return (
    <div ref={containerRef} className={styles.container}>
      <div className={styles.left} style={{ minWidth: right ? minLeftWidth : undefined }}>
        {left}
      </div>
      {right && (
        <>
          <div
            className={styles.divider}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize preview panel"
            tabIndex={0}
            onPointerDown={startDragging}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') setRightWidth((w) => Math.min(w + 24, 900))
              if (e.key === 'ArrowRight') setRightWidth((w) => Math.max(w - 24, minRightWidth))
            }}
          />
          <div className={styles.right} style={{ width: rightWidth, minWidth: minRightWidth }}>
            {right}
          </div>
        </>
      )}
    </div>
  )
}
