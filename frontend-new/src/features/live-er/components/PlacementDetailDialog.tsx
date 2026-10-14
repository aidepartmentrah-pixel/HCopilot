import { ArrowLeft, ArrowRightLeft, BedDouble, ClipboardList, Clock, LogOut, Pencil, UserRound, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
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
import shell from './dialogShell.module.css'
import local from './PlacementDetailDialog.module.css'

const styles = { ...shell, ...local }

const DESTINATION_OPTIONS = ['Home', 'Hospital Department'] as const

type Step = 'menu' | 'bed' | 'discharge'

interface PlacementDetailDialogProps {
  card: PlacementCardData | null
  onClose: () => void
  /** Open the Edit Patient popup for this active stay. */
  onEdit: (stayId: number) => void
}

/**
 * Centered dialog for one placement. A patient's menu has exactly two
 * decisions — move/assign a bed, or discharge — plus a pencil icon in the
 * header for editing their data. Each decision opens in place with a Back
 * button. Native <dialog>: focus trap, Escape and backdrop for free.
 */
export function PlacementDetailDialog({ card, onClose, onEdit }: PlacementDetailDialogProps) {
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
      {/* Mounted only while open so the step, inputs and errors reset for every card. */}
      {card && <DialogBody key={card.id} card={card} onClose={onClose} onEdit={onEdit} />}
    </dialog>
  )
}

function DialogBody({ card, onClose, onEdit }: { card: PlacementCardData; onClose: () => void; onEdit: (stayId: number) => void }) {
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

  const [step, setStep] = useState<Step>('menu')
  const [targetBedId, setTargetBedId] = useState('')
  const [bedError, setBedError] = useState<string | null>(null)

  const [destination, setDestination] = useState<string>('Home')
  const [destinationDetail, setDestinationDetail] = useState('')
  const [departure, setDeparture] = useState(() => toLocalDatetimeString())
  const [departureEdited, setDepartureEdited] = useState(false)
  const [dischargeError, setDischargeError] = useState<string | null>(null)

  // The active stay behind this card: a bedless card carries it; a bed card resolves it by patient id.
  const stay = useMemo(() => {
    if (card.patient) {
      const p = card.patient
      return { stayId: p.stay_id, name: p.name, age: p.age, gender: p.gender, arrival: p.arrival_time, complaint: p.chiefcomplaint }
    }
    const m = (patientsData?.patients ?? []).find((p) => p.patient_id === card.patientId)
    return m ? { stayId: m.stay_id, name: m.name, age: m.age, gender: m.gender, arrival: m.arrival_time, complaint: m.chiefcomplaint } : null
  }, [card.patient, card.patientId, patientsData])

  const freeBeds = useMemo(
    () => (bedsData?.beds ?? []).filter((b) => b.bed_status === 'Available' && b.bed_id !== card.bed?.bed_id),
    [bedsData, card.bed?.bed_id],
  )

  const patientName = stay?.name || (card.patientId != null ? `Patient #${card.patientId}` : 'Patient')
  const resolvedDestination =
    destination === 'Hospital Department' && destinationDetail.trim() ? `Hospital Department: ${destinationDetail.trim()}` : destination

  async function handleBedAction() {
    if (!targetBedId || card.patientId == null) return
    setBedError(null)
    try {
      if (isOccupiedBed) {
        await moveBed.mutateAsync({ patientId: card.patientId, newBedId: Number(targetBedId) })
        showToast(`${patientName} moved to the new bed.`, 'success')
      } else {
        await assignBed.mutateAsync({ bedId: Number(targetBedId), patientId: card.patientId })
        showToast(`${patientName} assigned to a bed.`, 'success')
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
      showToast(`${patientName} discharged.`, 'success')
      onClose()
    } catch (err) {
      setDischargeError(apiErrorMessage(err, 'Could not discharge this patient. Please try again.'))
    }
  }

  const dischargeIsArrivalProblem = !!dischargeError && /arrival|bed occupation/i.test(dischargeError)
  const bedBusy = moveBed.isPending || assignBed.isPending

  const demographics = stay ? [stay.age != null ? `${stay.age}y` : null, stay.gender].filter(Boolean).join(' · ') : ''
  // Bed cards: "Section A · Monitor bed"; a waiting patient has no bed yet.
  const subtitle =
    card.kind === 'bed'
      ? [card.bed?.ward_name, card.bedType ? `${card.bedType} bed` : null].filter(Boolean).join(' · ')
      : 'Waiting for a bed'
  const HeaderIcon = card.kind === 'bed' ? BedDouble : UserRound

  return (
    <div className={styles.shell}>
      <div className={styles.header}>
        <span className={styles.headerIcon} aria-hidden="true">
          <HeaderIcon size={24} />
        </span>
        <div className={styles.headerText}>
          <h2 id="placement-dialog-title" className={styles.title} dir="auto">
            {card.kind === 'bed' ? card.primary : patientName}
          </h2>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          <div className={styles.headerBadge}>
            <StatusBadge label={card.statusLabel} tone={card.statusTone} />
          </div>
        </div>
        <div className={styles.headerActions}>
          {hasPatient && stay && <IconButton icon={<Pencil size={18} />} label="Edit patient data" onClick={() => onEdit(stay.stayId)} />}
          <IconButton icon={<X size={18} />} label="Close" onClick={onClose} />
        </div>
      </div>

      {step === 'menu' && (
        <>
          <div className={styles.body}>
            {isAvailableBed && <p className={styles.hint}>This bed is available. Pick a waiting patient from the board to place them here.</p>}
            {isUnderRepair && <p className={styles.hint}>This bed is marked Under Repair. Change its condition from Settings → Beds.</p>}
            {hasPatient && (
              <>
                <div>
                  <p className={styles.sectionLabel}>{isOccupiedBed ? 'Current patient' : 'Patient'}</p>
                  <h3 className={styles.patientName} dir="auto">
                    {patientName}
                  </h3>
                  {(demographics || (stay?.name && card.patientId != null)) && (
                    <p className={styles.demographics}>
                      {[demographics, stay?.name && card.patientId != null ? `#${card.patientId}` : ''].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <dl className={styles.facts}>
                  <div className={styles.fact}>
                    <Clock size={20} className={styles.factIcon} aria-hidden="true" />
                    <div>
                      <dt>Arrived</dt>
                      <dd>{stay?.arrival ? formatClinicalDate(stay.arrival) : <span className={styles.notRecorded}>Not recorded</span>}</dd>
                    </div>
                  </div>
                  <div className={styles.fact}>
                    <ClipboardList size={20} className={styles.factIcon} aria-hidden="true" />
                    <div>
                      <dt>Chief complaint</dt>
                      <dd dir="auto">{stay?.complaint || <span className={styles.notRecorded}>Not recorded</span>}</dd>
                    </div>
                  </div>
                </dl>
              </>
            )}
          </div>
          {hasPatient && (
            <div className={styles.footer}>
              <div className={styles.choices}>
                <Button className={styles.choice} onClick={() => setStep('bed')}>
                  <ArrowRightLeft size={18} aria-hidden="true" /> {isOccupiedBed ? 'Change bed' : 'Assign bed'}
                </Button>
                <Button className={styles.choice} variant="destructive" onClick={() => setStep('discharge')}>
                  <LogOut size={18} aria-hidden="true" /> Discharge patient
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {step !== 'menu' && (
        <div className={styles.body}>
        {step === 'bed' && hasPatient && (
          <>
            <button type="button" className={styles.back} onClick={() => setStep('menu')}>
              <ArrowLeft size={16} aria-hidden="true" /> Back
            </button>
            <h3 className={styles.stepTitle}>{isOccupiedBed ? 'Move to another bed' : 'Assign a bed'}</h3>
            <p className={styles.hint}>
              {isOccupiedBed
                ? 'The doctor and nurse links stay as they are.'
                : 'The time you assign is recorded as the bed occupation time.'}
            </p>
            <FormField label="Available bed" htmlFor="target-bed">
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

        {step === 'discharge' && hasPatient && (
          <>
            <button type="button" className={styles.back} onClick={() => setStep('menu')}>
              <ArrowLeft size={16} aria-hidden="true" /> Back
            </button>
            <h3 className={styles.stepTitle}>Discharge {patientName}</h3>
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
                  <button type="button" className={styles.errorLink} onClick={() => onEdit(stay.stayId)}>
                    Fix the arrival time →
                  </button>
                )}
              </p>
            )}
            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => setStep('menu')}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDischarge} loading={dischargeFromBed.isPending || dischargeBedless.isPending}>
                Discharge Patient
              </Button>
            </div>
          </>
        )}
        </div>
      )}
    </div>
  )
}
