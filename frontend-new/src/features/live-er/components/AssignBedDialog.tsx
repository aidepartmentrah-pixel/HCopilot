import { Search, UserPlus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import type { PlacementCardData } from '../utils'
import shell from './dialogShell.module.css'
import local from './AssignBedDialog.module.css'

const styles = { ...shell, ...local }

interface AssignBedDialogProps {
  /** The available bed being filled; null = closed. */
  bed: PlacementCardData | null
  /** Patients still waiting for a bed — the searchable choices. */
  waitingPatients: PlacementCardData[]
  loading?: boolean
  onAssign: (patientId: number) => void
  onClose: () => void
}

/** A stay can reach the board without a name (e.g. a bare roster arrival): show its number instead of an empty row. */
function displayName(p: PlacementCardData): string {
  return p.primary?.trim() || `Patient #${p.patientId ?? '?'}`
}

/**
 * Centered pop-up for putting a waiting patient into an available bed: type part of a name (or ID /
 * complaint) and the list narrows live; click a row to pick it, then Assign. The assignment time is
 * stamped server-side, so there is deliberately no occupation-time field. Shares its template with
 * the Manage Bed popup (dialogShell.module.css); native <dialog> like ConfirmDialog (focus trap,
 * Escape, backdrop for free).
 */
export function AssignBedDialog({ bed, waitingPatients, loading = false, onAssign, onClose }: AssignBedDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const open = bed !== null

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
        onClose()
      }}
      onClose={onClose}
      aria-labelledby="assign-bed-title"
    >
      {/* Mounted only while open, so the search text and pick reset on every open. */}
      {bed && <AssignBedForm bed={bed} waitingPatients={waitingPatients} loading={loading} onAssign={onAssign} onClose={onClose} />}
    </dialog>
  )
}

function AssignBedForm({ bed, waitingPatients, loading, onAssign, onClose }: Required<Omit<AssignBedDialogProps, 'bed'>> & { bed: PlacementCardData }) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return waitingPatients
    return waitingPatients.filter((p) => `${displayName(p)} ${p.patientId ?? ''} ${p.sub}`.toLowerCase().includes(q))
  }, [query, waitingPatients])

  // Typing until exactly one patient is left is enough — no extra click needed.
  const effectiveId = selectedId ?? (matches.length === 1 ? (matches[0].patientId ?? null) : null)
  const effective = matches.find((p) => p.patientId === effectiveId) ?? null

  const subtitle = [bed.bed?.ward_name, bed.bedType ? `${bed.bedType} bed` : null].filter(Boolean).join(' · ')

  return (
    <div className={styles.shell}>
      <div className={styles.header}>
        <span className={styles.headerIcon} aria-hidden="true">
          <UserPlus size={24} />
        </span>
        <div className={styles.headerText}>
          <h2 id="assign-bed-title" className={styles.title}>
            Assign a patient to {bed.primary}
          </h2>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
        <div className={styles.headerActions}>
          <IconButton icon={<X size={18} />} label="Close" onClick={onClose} />
        </div>
      </div>

      <div className={styles.body}>
        <p className={styles.hint}>Search the waiting patients by name, then pick one. The time you assign is recorded as the bed occupation time.</p>

        <div className={styles.searchWrap}>
          <Search size={16} className={styles.searchIcon} aria-hidden />
          <input
            className={styles.search}
            dir="auto"
            autoFocus
            placeholder="Type a patient name…"
            aria-label="Search waiting patients"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedId(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && effective?.patientId != null) {
                e.preventDefault()
                onAssign(effective.patientId)
              }
            }}
          />
        </div>

        <ul className={styles.list} role="listbox" aria-label="Waiting patients">
          {matches.length === 0 && (
            <li className={styles.empty}>{waitingPatients.length === 0 ? 'No patients are waiting for a bed.' : 'No waiting patient matches that search.'}</li>
          )}
          {matches.map((p) => {
            const named = !!p.primary?.trim()
            return (
              <li key={p.id} role="option" aria-selected={p.patientId === effectiveId}>
                <button
                  type="button"
                  className={[styles.row, p.patientId === effectiveId ? styles.rowSelected : ''].filter(Boolean).join(' ')}
                  onClick={() => setSelectedId(p.patientId ?? null)}
                  onDoubleClick={() => p.patientId != null && onAssign(p.patientId)}
                >
                  <span className={styles.name} dir="auto">
                    {displayName(p)}
                  </span>
                  <span className={styles.meta} dir="auto">
                    {[named ? `#${p.patientId}` : null, p.sub].filter(Boolean).join(' · ') || 'No details recorded'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <div className={styles.footer}>
        <div className={styles.choices}>
          <Button className={styles.choice} variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className={styles.choice}
            variant="primary"
            disabled={effective?.patientId == null}
            loading={loading}
            onClick={() => effective?.patientId != null && onAssign(effective.patientId)}
          >
            Assign Patient
          </Button>
        </div>
      </div>
    </div>
  )
}
