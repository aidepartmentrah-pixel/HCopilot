import { X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiErrorMessage } from '@/api/client'
import { useToast } from '@/components/feedback/useToast'
import { DateTimeInput, toLocalDatetimeString } from '@/components/forms/DateTimeInput'
import { FormField } from '@/components/forms/FormField'
import { Input } from '@/components/forms/Input'
import { Select } from '@/components/forms/Select'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAssignBed, useBeds, useDischargeBedless, useDischargeFromBed, useMoveBed } from '@/hooks/useBeds'
import { usePatients } from '@/hooks/usePatients'
import { formatClinicalDate } from '@/utils/dateFormat'
import type { PlacementCardData } from '../utils'
import styles from './PlacementDetailDialog.module.css'

const DESTINATION_OPTIONS = ['Home', 'Hospital Department'] as const

type TabId = 'overview' | 'bed' | 'discharge'

interface PlacementDetailDialogProps {
  card: PlacementCardData | null
  onClose: () => void
}

/**
 * Centered dialog (replaces the old right-hand drawer) for one placement:
 * Overview, Bed (move an occupied patient / assign a waiting one),
 * Edit ISBAR (deep link into the ISBAR page for that stay) and Discharge
 * (with an explicit departure time and the server's reason on failure).
 * Native <dialog> like AssignBedDialog: focus trap, Escape and backdrop for free.
 */
export function PlacementDetailDialog({ card, onClose }: PlacementDetailDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const open = card !== null

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="placement-dialog-title"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClose={onClose}
    >
      {/* Mounted only while open so tab, inputs and errors reset for every card. */}
      {card && <DialogBody key={card.id} card={card} onClose={onClose} />}
    </dialog>
  )
}

function DialogBody({ card, onClose }: { card: PlacementCardData; onClose: () => void }) {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { data: bedsData } = useBeds()
  const { data: patientsData } = usePatients()
  const moveBed = useMoveBed()
  const assignBed = useAssignBed()
  const dischargeFromBed = useDischargeFromBed()
  const dischargeBedless = useDischargeBedless()

  const isOccupiedBed = card.kind === 'bed' && card.bed?.bed_status === 'Occupied'
  const isAvailableBed = card.kind === 'bed' && card.bed?.bed_status === 'Available'
  const isUnderRepair = card.kind === 'bed' && card.bed?.bed_status === 'Under Repair'
  const isWaiting = card.kind === 'waiting'
  const hasPatient = isOccupiedBed || isWaiting

  const [tab, setTab] = useState<TabId>('overview')
  const [targetBedId, setTargetBedId] = useState('')
  const [bedError, setBedError] = useState<string | null>(null)

  const [destination, setDestination] = useState<string>('Home')
  const [destinationDetail, setDestinationDetail] = useState('')
  const [departure, setDeparture] = useState(() => toLocalDatetimeString())
  const [departureEdited, setDepartureEdited] = useState(false)
  const [dischargeError, setDischargeError] = useState<string | null>(null)

  // The active stay behind this card: a bedless card carries it; a bed card resolves it by patient id.
  const stay = useMemo(() => {
    if (card.patient) return { stayId: card.patient.stay_id, arrival: card.patient.arrival_time, complaint: card.patient.chiefcomplaint }
    const match = (patientsData?.patients ?? []).find((p) => p.patient_id === card.patientId)
    return match ? { stayId: match.stay_id, arrival: match.arrival_time, complaint: match.chiefcomplaint } : null
  }, [card.patient, card.patientId, patientsData])

  const freeBeds = useMemo(
    () => (bedsData?.beds ?? []).filter((b) => b.bed_status === 'Available' && b.bed_id !== card.bed?.bed_id),
    [bedsData, card.bed?.bed_id],
  )

  const resolvedDestination =
    destination === 'Hospital Department' && destinationDetail.trim() ? `Hospital Department: ${destinationDetail.trim()}` : destination

  async function handleBedAction() {
    if (!targetBedId || card.patientId == null) return
    setBedError(null)
    try {
      if (isOccupiedBed) {
        await moveBed.mutateAsync({ patientId: card.patientId, newBedId: Number(targetBedId) })
        showToast(`${card.sub.split(' · ')[0] || 'Patient'} moved to the new bed.`, 'success')
      } else {
        await assignBed.mutateAsync({ bedId: Number(targetBedId), patientId: card.patientId })
        showToast(`${card.primary} assigned to a bed.`, 'success')
      }
      onClose()
    } catch (err) {
      setBedError(apiErrorMessage(err, 'Could not change the bed. Please try again.'))
    }
  }

  async function handleDischarge() {
    setDischargeError(null)
    // Untouched departure = "discharge right now": omit it so the server stamps its own clock.
    const body = { destination: resolvedDestination, ...(departureEdited ? { departure_time: departure } : {}) }
    try {
      if (isOccupiedBed && card.bed) {
        await dischargeFromBed.mutateAsync({ bedId: card.bed.bed_id, body })
      } else if (card.patient) {
        await dischargeBedless.mutateAsync({ patientId: card.patient.subject_id, body })
      } else {
        return
      }
      showToast('Patient discharged.', 'success')
      onClose()
    } catch (err) {
      setDischargeError(apiErrorMessage(err, 'Could not discharge this patient. Please try again.'))
    }
  }

  const tabs: { id: TabId; label: string }[] = [{ id: 'overview', label: 'Overview' }]
  if (hasPatient) {
    tabs.push({ id: 'bed', label: isOccupiedBed ? 'Change bed' : 'Assign bed' }, { id: 'discharge', label: 'Discharge' })
  }

  const dischargeIsArrivalProblem = !!dischargeError && /arrival|bed occupation/i.test(dischargeError)
  const bedBusy = moveBed.isPending || assignBed.isPending

  return (
    <div className={styles.shell}>
      <div className={styles.header}>
        <div>
          <h2 id="placement-dialog-title" className={styles.title} dir="auto">
            {card.primary}
          </h2>
          <div className={styles.identity}>
            <StatusBadge label={card.statusLabel} tone={card.statusTone} />
            {card.bedType && <span className={styles.bedType}>{card.bedType}</span>}
            {card.patientId != null && <span>Patient #{card.patientId}</span>}
          </div>
        </div>
        <IconButton icon={<X size={18} />} label="Close" onClick={onClose} />
      </div>

      {tabs.length > 1 && (
        <div className={styles.tabs} role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={[styles.tab, tab === t.id ? styles.tabActive : ''].filter(Boolean).join(' ')}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className={styles.body}>
        {tab === 'overview' && (
          <>
            {isAvailableBed && <p className={styles.hint}>This bed is available. Pick a waiting patient from the board to place them here.</p>}
            {isUnderRepair && <p className={styles.hint}>This bed is marked Under Repair. Change its condition from Settings → Beds.</p>}
            {hasPatient && (
              <>
                <p className={styles.detailLine} dir="auto">
                  {isWaiting
                    ? [card.patient?.age != null ? `${card.patient.age}y` : null, card.patient?.gender, card.patient?.chiefcomplaint].filter(Boolean).join(' · ') || '—'
                    : card.sub || '—'}
                </p>
                <dl className={styles.facts}>
                  <div>
                    <dt>Arrived</dt>
                    <dd>{stay?.arrival ? formatClinicalDate(stay.arrival) : '—'}</dd>
                  </div>
                  <div>
                    <dt>Chief complaint</dt>
                    <dd dir="auto">{stay?.complaint || '—'}</dd>
                  </div>
                </dl>
                {stay ? (
                  <div className={styles.actions}>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        onClose()
                        navigate(`/isbar?stay=${stay.stayId}`)
                      }}
                    >
                      Edit ISBAR data
                    </Button>
                  </div>
                ) : (
                  <p className={styles.hint}>Loading the patient's record…</p>
                )}
              </>
            )}
          </>
        )}

        {tab === 'bed' && hasPatient && (
          <>
            <p className={styles.hint}>
              {isOccupiedBed
                ? 'Move this patient to another available bed. The doctor and nurse links stay as they are.'
                : 'Choose an available bed for this waiting patient. The time you assign is recorded as the bed occupation time.'}
            </p>
            <FormField label={isOccupiedBed ? 'Move to bed' : 'Assign to bed'} htmlFor="target-bed">
              <Select id="target-bed" value={targetBedId} onChange={(e) => setTargetBedId(e.target.value)} placeholder="Select an available bed…">
                {freeBeds.map((b) => (
                  <option key={b.bed_id} value={b.bed_id}>
                    Bed {b.bed_number} · {b.bed_type}
                    {b.ward_name ? ` · ${b.ward_name}` : ''}
                  </option>
                ))}
              </Select>
            </FormField>
            {freeBeds.length === 0 && <p className={styles.hint}>There are no available beds right now.</p>}
            {bedError && (
              <p className={styles.error} role="alert">
                {bedError}
              </p>
            )}
            <div className={styles.actions}>
              <Button onClick={handleBedAction} disabled={!targetBedId} loading={bedBusy}>
                {isOccupiedBed ? 'Move patient' : 'Assign patient'}
              </Button>
            </div>
          </>
        )}

        {tab === 'discharge' && hasPatient && (
          <>
            <FormField label="Departure time" htmlFor="departure-time" hint="Leave as is to discharge right now.">
              <DateTimeInput
                id="departure-time"
                value={departure}
                maxNow
                onChange={(v) => {
                  setDeparture(v)
                  setDepartureEdited(true)
                }}
              />
            </FormField>
            <FormField label="Destination" htmlFor="destination">
              <Select id="destination" value={destination} onChange={(e) => setDestination(e.target.value)}>
                {DESTINATION_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            </FormField>
            {destination === 'Hospital Department' && (
              <FormField label="Department name" htmlFor="destination-detail">
                <Input id="destination-detail" value={destinationDetail} onChange={(e) => setDestinationDetail(e.target.value)} />
              </FormField>
            )}
            {dischargeError && (
              <p className={styles.error} role="alert">
                {dischargeError}
                {dischargeIsArrivalProblem && stay && (
                  <Link className={styles.errorLink} to={`/isbar?stay=${stay.stayId}`} onClick={onClose}>
                    Fix the arrival time in ISBAR entry →
                  </Link>
                )}
              </p>
            )}
            <div className={styles.actions}>
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDischarge} loading={dischargeFromBed.isPending || dischargeBedless.isPending}>
                Discharge Patient
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
