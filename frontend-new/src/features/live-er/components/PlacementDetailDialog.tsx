import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { FormField } from '@/components/forms/FormField'
import { Input } from '@/components/forms/Input'
import { Select } from '@/components/forms/Select'
import { useToast } from '@/components/feedback/useToast'
import { useAssignBed, useDischargeBedless, useDischargeFromBed } from '@/hooks/useBeds'
import type { BedlessPatient } from '@/types/bed'
import type { PlacementCardData } from '../utils'
import styles from './PlacementDetailDialog.module.css'

const DESTINATION_OPTIONS = ['Home', 'Hospital Department'] as const

interface PlacementDetailDialogProps {
  card: PlacementCardData | null
  waitingPatients: BedlessPatient[]
  onClose: () => void
}

export function PlacementDetailDialog({ card, waitingPatients, onClose }: PlacementDetailDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { showToast } = useToast()
  const assignBed = useAssignBed()
  const dischargeFromBed = useDischargeFromBed()
  const dischargeBedless = useDischargeBedless()

  const [assignPatientId, setAssignPatientId] = useState('')
  const [destination, setDestination] = useState<string>('Home')
  const [destinationDetail, setDestinationDetail] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (card && !dialog.open) dialog.showModal()
    else if (!card && dialog.open) dialog.close()
    setAssignPatientId('')
    setDestination('Home')
    setDestinationDetail('')
  }, [card])

  if (!card) {
    return <dialog ref={dialogRef} className={styles.dialog} onClose={onClose} />
  }

  const isAvailableBed = card.kind === 'bed' && card.bed?.bed_status === 'Available'
  const isOccupiedBed = card.kind === 'bed' && card.bed?.bed_status === 'Occupied'
  const isUnderRepair = card.kind === 'bed' && card.bed?.bed_status === 'Under Repair'
  const isWaiting = card.kind === 'waiting'

  const resolvedDestination = destination === 'Hospital Department' && destinationDetail ? `Hospital Department: ${destinationDetail}` : destination

  async function handleAssign() {
    if (!card?.bed || !assignPatientId) return
    try {
      await assignBed.mutateAsync({ bedId: card.bed.bed_id, patientId: Number(assignPatientId) })
      showToast('Bed assigned.', 'success')
      onClose()
    } catch {
      showToast('Could not assign this bed.', 'error')
    }
  }

  async function handleDischargeFromBed() {
    if (!card?.bed) return
    try {
      await dischargeFromBed.mutateAsync({ bedId: card.bed.bed_id, body: { destination: resolvedDestination } })
      showToast('Patient discharged.', 'success')
      onClose()
    } catch {
      showToast('Could not discharge this patient.', 'error')
    }
  }

  async function handleDischargeBedless() {
    if (!card?.patient) return
    try {
      await dischargeBedless.mutateAsync({ patientId: card.patient.subject_id, body: { destination: resolvedDestination } })
      showToast('Patient discharged.', 'success')
      onClose()
    } catch {
      showToast('Could not discharge this patient.', 'error')
    }
  }

  return (
    <dialog ref={dialogRef} className={styles.dialog} onClose={onClose} aria-labelledby="placement-dialog-title">
      <div className={styles.header}>
        <h2 id="placement-dialog-title" className={styles.title}>
          {card.primary}
        </h2>
        <StatusBadge label={card.statusLabel} tone={card.statusTone} />
      </div>

      {isOccupiedBed && card.bed && (
        <div className={styles.body}>
          <p className={styles.detailLine} dir="auto">
            {card.sub}
          </p>
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
            <FormField label="Department Name" htmlFor="destination-detail">
              <Input id="destination-detail" value={destinationDetail} onChange={(e) => setDestinationDetail(e.target.value)} />
            </FormField>
          )}
          <div className={styles.actions}>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDischargeFromBed} loading={dischargeFromBed.isPending}>
              Discharge Patient
            </Button>
          </div>
        </div>
      )}

      {isAvailableBed && (
        <div className={styles.body}>
          <FormField label="Assign Patient" htmlFor="assign-patient" required>
            <Select id="assign-patient" value={assignPatientId} onChange={(e) => setAssignPatientId(e.target.value)} placeholder="Select a waiting patient…">
              {waitingPatients.map((p) => (
                <option key={p.stay_id} value={p.subject_id}>
                  {p.name} {p.chiefcomplaint ? `— ${p.chiefcomplaint}` : ''}
                </option>
              ))}
            </Select>
          </FormField>
          {waitingPatients.length === 0 && <p className={styles.empty}>No patients currently waiting for a bed.</p>}
          <div className={styles.actions}>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleAssign} disabled={!assignPatientId} loading={assignBed.isPending}>
              Assign Bed
            </Button>
          </div>
        </div>
      )}

      {isUnderRepair && (
        <div className={styles.body}>
          <p className={styles.detailLine}>This bed is marked Under Repair. Change its condition from Settings → Beds.</p>
          <div className={styles.actions}>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}

      {isWaiting && card.patient && (
        <div className={styles.body}>
          <p className={styles.detailLine} dir="auto">
            {[card.patient.age != null ? `${card.patient.age}y` : null, card.patient.gender, card.patient.chiefcomplaint]
              .filter(Boolean)
              .join(' · ') || '—'}
          </p>
          <FormField label="Destination" htmlFor="destination-waiting">
            <Select id="destination-waiting" value={destination} onChange={(e) => setDestination(e.target.value)}>
              {DESTINATION_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          </FormField>
          {destination === 'Hospital Department' && (
            <FormField label="Department Name" htmlFor="destination-detail-waiting">
              <Input id="destination-detail-waiting" value={destinationDetail} onChange={(e) => setDestinationDetail(e.target.value)} />
            </FormField>
          )}
          <div className={styles.actions}>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDischargeBedless} loading={dischargeBedless.isPending}>
              Discharge Patient
            </Button>
          </div>
        </div>
      )}
    </dialog>
  )
}
