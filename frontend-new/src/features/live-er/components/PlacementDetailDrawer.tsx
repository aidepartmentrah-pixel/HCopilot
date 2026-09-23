import { useState } from 'react'
import { Drawer } from '@/components/layout/Drawer'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { FormField } from '@/components/forms/FormField'
import { Input } from '@/components/forms/Input'
import { Select } from '@/components/forms/Select'
import { useToast } from '@/components/feedback/useToast'
import { useDischargeBedless, useDischargeFromBed } from '@/hooks/useBeds'
import type { PlacementCardData } from '../utils'
import styles from './PlacementDetailDrawer.module.css'

const DESTINATION_OPTIONS = ['Home', 'Hospital Department'] as const

interface PlacementDetailDrawerProps {
  card: PlacementCardData | null
  onClose: () => void
}

/**
 * Right-side drawer, not a page navigation or a centered modal (Live ER
 * spec §29) — the board stays visible and in context behind it. Routine
 * bed assignment does not happen here anymore: that's the select-a-waiting-
 * card-then-click-an-available-bed flow on the board itself (§22-§26);
 * this drawer covers View/Discharge for an existing placement, and an
 * honest "nothing to do yet" state for an available bed with no patient
 * selected.
 */
export function PlacementDetailDrawer({ card, onClose }: PlacementDetailDrawerProps) {
  const { showToast } = useToast()
  const dischargeFromBed = useDischargeFromBed()
  const dischargeBedless = useDischargeBedless()

  const [destination, setDestination] = useState<string>('Home')
  const [destinationDetail, setDestinationDetail] = useState('')

  const isAvailableBed = card?.kind === 'bed' && card.bed?.bed_status === 'Available'
  const isOccupiedBed = card?.kind === 'bed' && card.bed?.bed_status === 'Occupied'
  const isUnderRepair = card?.kind === 'bed' && card.bed?.bed_status === 'Under Repair'
  const isWaiting = card?.kind === 'waiting'

  const resolvedDestination = destination === 'Hospital Department' && destinationDetail ? `Hospital Department: ${destinationDetail}` : destination

  function resetAndClose() {
    setDestination('Home')
    setDestinationDetail('')
    onClose()
  }

  async function handleDischargeFromBed() {
    if (!card?.bed) return
    try {
      await dischargeFromBed.mutateAsync({ bedId: card.bed.bed_id, body: { destination: resolvedDestination } })
      showToast('Patient discharged.', 'success')
      resetAndClose()
    } catch {
      showToast('Could not discharge this patient.', 'error')
    }
  }

  async function handleDischargeBedless() {
    if (!card?.patient) return
    try {
      await dischargeBedless.mutateAsync({ patientId: card.patient.subject_id, body: { destination: resolvedDestination } })
      showToast('Patient discharged.', 'success')
      resetAndClose()
    } catch {
      showToast('Could not discharge this patient.', 'error')
    }
  }

  return (
    <Drawer open={!!card} title={card?.primary ?? ''} onClose={resetAndClose} width={380}>
      {card && (
        <div className={styles.body}>
          <div className={styles.statusRow}>
            <StatusBadge label={card.statusLabel} tone={card.statusTone} />
            {card.bedType && <span className={styles.bedType}>{card.bedType}</span>}
          </div>

          {isOccupiedBed && card.bed && (
            <>
              <p className={styles.detailLine} dir="auto">
                {card.sub}
              </p>
              {card.patientId != null && <p className={styles.meta}>Patient #{card.patientId}</p>}
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
                <Button variant="destructive" onClick={handleDischargeFromBed} loading={dischargeFromBed.isPending}>
                  Discharge Patient
                </Button>
              </div>
            </>
          )}

          {isAvailableBed && (
            <p className={styles.hint}>
              This bed is available. Select a patient from the Waiting / No Bed lane, then click this bed to assign it.
            </p>
          )}

          {isUnderRepair && <p className={styles.hint}>This bed is marked Under Repair. Change its condition from Settings → Beds.</p>}

          {isWaiting && card.patient && (
            <>
              <p className={styles.detailLine} dir="auto">
                {[card.patient.age != null ? `${card.patient.age}y` : null, card.patient.gender, card.patient.chiefcomplaint]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </p>
              {card.patientId != null && <p className={styles.meta}>Patient #{card.patientId}</p>}
              <p className={styles.hint}>To assign a bed, close this panel, click this patient's card to select it, then click an available bed.</p>
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
                <Button variant="destructive" onClick={handleDischargeBedless} loading={dischargeBedless.isPending}>
                  Discharge Patient
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Drawer>
  )
}
